import "server-only";

import { requireSessionUserId } from "@hiveforyou/core";

import { CaseNotFoundError } from "@/lib/canonical-study/study-service-server";
import { loadCanonicalCaseByStudyRunId } from "@/lib/case/load-case-by-study-run";
import { readServerEnv } from "@/lib/env/server-env";
import { createSupabaseHiveGateway } from "@/lib/persistence/hive-gateway";
import { loadLatestStructureMapForCase } from "@/lib/persistence/supabase-case-projections";
import {
  SupabaseCaseRepository,
  SupabaseSourceDocumentRepository,
  SupabaseSourceDocumentStorage,
  SupabaseStudyRunRepository,
} from "@/lib/persistence/supabase-repositories";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient, getAuthenticatedUserId } from "@/lib/supabase/server";

import { StudyRunNotFoundError } from "./evidence-trace-service-server";
import {
  matchStudySourceDocumentRef,
  resolvePersistedSourceDocumentForStudy,
} from "./resolve-study-source-document.server";

export class SourceDocumentNotFoundError extends Error {
  readonly code = "SOURCE_DOCUMENT_NOT_FOUND";

  constructor() {
    super("Source document was not found for this study.");
    this.name = "SourceDocumentNotFoundError";
  }
}

export class SourceDocumentStorageError extends Error {
  readonly code = "SOURCE_DOCUMENT_STORAGE_ERROR";

  constructor(message = "Could not read document bytes from storage.") {
    super(message);
    this.name = "SourceDocumentStorageError";
  }
}

async function downloadFromSupabaseStorage(input: {
  sessionUserId: string;
  bucket: string;
  path: string;
}): Promise<Uint8Array> {
  const env = readServerEnv();
  if (input.bucket !== env.HIVE_STORAGE_BUCKET) {
    throw new SourceDocumentStorageError("Unexpected storage bucket.");
  }

  const sessionGateway = createSupabaseHiveGateway(await createServerSupabaseClient());
  const sessionStorage = new SupabaseSourceDocumentStorage(
    sessionGateway,
    env.HIVE_STORAGE_BUCKET,
    input.sessionUserId,
  );

  try {
    return await sessionStorage.get({ bucket: input.bucket, path: input.path });
  } catch {
    const adminGateway = createSupabaseHiveGateway(createAdminSupabaseClient());
    const adminStorage = new SupabaseSourceDocumentStorage(
      adminGateway,
      env.HIVE_STORAGE_BUCKET,
      input.sessionUserId,
    );
    try {
      return await adminStorage.get({ bucket: input.bucket, path: input.path });
    } catch {
      throw new SourceDocumentStorageError();
    }
  }
}

export async function loadSourceDocumentFileForStudyRun(input: {
  studyRunId: string;
  sourceDocumentId: string;
  originalFilenameHint?: string | null;
}): Promise<{ bytes: Uint8Array; mimeType: string; filename: string }> {
  const sessionUserId = requireSessionUserId(await getAuthenticatedUserId());
  const sessionGateway = createSupabaseHiveGateway(await createServerSupabaseClient());
  const runRepo = new SupabaseStudyRunRepository(sessionGateway, sessionUserId);
  const run = await runRepo.getByStudyRunId(input.studyRunId);
  if (!run) {
    throw new StudyRunNotFoundError();
  }

  const cases = new SupabaseCaseRepository(sessionGateway, sessionUserId);
  const ownedCase = await cases.getById(sessionUserId, run.caseId);
  if (!ownedCase) {
    throw new CaseNotFoundError();
  }

  const snapshot = await loadCanonicalCaseByStudyRunId({
    gateway: sessionGateway,
    userId: sessionUserId,
    studyRunId: input.studyRunId,
  });
  const structureMap = await loadLatestStructureMapForCase(
    sessionGateway,
    sessionUserId,
    run.caseId,
  );

  const documents = new SupabaseSourceDocumentRepository(sessionGateway, sessionUserId);
  const filenameHint = input.originalFilenameHint?.trim() || null;
  let record = await resolvePersistedSourceDocumentForStudy({
    documents,
    userId: sessionUserId,
    caseId: run.caseId,
    requestedSourceDocumentId: input.sourceDocumentId,
    snapshot,
    structureMap,
  });

  if (!record && filenameHint) {
    const caseDocs = await documents.listByCase(sessionUserId, run.caseId);
    const matches = caseDocs.filter((doc) => doc.originalFilename === filenameHint);
    record = matches.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  }

  const meta = matchStudySourceDocumentRef(snapshot, input.sourceDocumentId);

  const bucket = record?.storageBucket ?? meta?.storageBucket;
  const path = record?.storagePath ?? meta?.storagePath;

  if (!bucket || !path) {
    throw new SourceDocumentNotFoundError();
  }

  const bytes = await downloadFromSupabaseStorage({
    sessionUserId,
    bucket,
    path,
  });

  return {
    bytes,
    mimeType: record?.mimeType?.trim() || meta?.mimeType?.trim() || "application/pdf",
    filename:
      record?.originalFilename?.trim() || meta?.originalFilename?.trim() || "document.pdf",
  };
}
