import "server-only";

import {
  assertReaderDocumentExtractionAttemptManifestObjectKey,
  assertReaderDocumentExtractionEnvelopeObjectKey,
  buildRawExtractionInspectorBundle,
  isStudyRawExtractionArtifact,
  orderSourceDocumentIdsForEngine1,
  requireSessionUserId,
  type RawExtractionInspectorBundle,
  type StudyRawExtractionArtifact,
} from "@hiveforyou/core";
import { readerDocumentExtractionStudyRunManifestPath } from "@hiveforyou/shared/hive-artifact-paths";
import {
  parseReaderDocumentExtractionEnvelope,
  type ReaderDocumentExtractionAttemptManifest,
  type ReaderDocumentExtractionEnvelope,
  type ReaderDocumentExtractionStudyRunManifest,
} from "@hiveforyou/shared/reader-document-extraction";

import { CaseNotFoundError } from "@/lib/canonical-study/study-service-server";
import { StudyRunNotFoundError } from "@/lib/case-map/case-map-bundle-service-server";
import { createSupabaseHiveGateway, type HiveGateway } from "@/lib/persistence/hive-gateway";
import {
  SupabaseCaseRepository,
  SupabaseStudyContextRepository,
  SupabaseStudyRunRepository,
} from "@/lib/persistence/supabase-repositories";
import { SupabaseStudyArtifactRepository } from "@/lib/persistence/supabase-study-artifacts";
import { createServerSupabaseClient, getAuthenticatedUserId } from "@/lib/supabase/server";

export class RawExtractionNotFoundError extends Error {
  readonly code = "RAW_EXTRACTION_NOT_FOUND";

  constructor() {
    super("Raw extraction artifacts were not found for this study run.");
    this.name = "RawExtractionNotFoundError";
  }
}

const DOCUMENT_PAGES_BUCKET = "document-pages";

async function downloadJson<T>(gateway: HiveGateway, objectKey: string): Promise<T | null> {
  try {
    const bytes = await gateway.downloadObject(DOCUMENT_PAGES_BUCKET, objectKey);
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}

function parseAttemptManifest(raw: unknown): ReaderDocumentExtractionAttemptManifest | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const record = raw as ReaderDocumentExtractionAttemptManifest;
  if (record.schemaVersion !== "hive.reader-document-extraction-manifest/1") {
    return null;
  }
  return record;
}

function hasRawExtractionArtifactEvidence(input: {
  terminalArtifact: StudyRawExtractionArtifact | null;
  studyRunManifest: ReaderDocumentExtractionStudyRunManifest | null;
  attemptManifest: ReaderDocumentExtractionAttemptManifest | null;
  envelopesBySourceDocumentId: Map<string, ReaderDocumentExtractionEnvelope>;
}): boolean {
  return (
    input.terminalArtifact !== null ||
    input.studyRunManifest !== null ||
    input.attemptManifest !== null ||
    input.envelopesBySourceDocumentId.size > 0
  );
}

function parseStudyRunManifest(raw: unknown): ReaderDocumentExtractionStudyRunManifest | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const record = raw as ReaderDocumentExtractionStudyRunManifest;
  if (record.schemaVersion !== "hive.reader-document-extraction-manifest/1") {
    return null;
  }
  return record;
}

export async function loadRawExtractionInspectorBundle(input: {
  caseId: string;
  studyRunId: string;
}): Promise<RawExtractionInspectorBundle & { intakeRunId: string | null }> {
  const sessionUserId = requireSessionUserId(await getAuthenticatedUserId());
  const gateway = createSupabaseHiveGateway(await createServerSupabaseClient());

  const ownedCase = await new SupabaseCaseRepository(gateway, sessionUserId).getById(
    sessionUserId,
    input.caseId,
  );
  if (!ownedCase) {
    throw new CaseNotFoundError();
  }

  const run = await new SupabaseStudyRunRepository(gateway, sessionUserId).getByStudyRunId(
    input.studyRunId,
  );
  if (!run || run.caseId !== input.caseId) {
    throw new StudyRunNotFoundError();
  }

  const context = await new SupabaseStudyContextRepository(gateway, sessionUserId).getByStudyRunId(
    input.studyRunId,
  );

  const artifactRecord = await new SupabaseStudyArtifactRepository(
    gateway,
    sessionUserId,
  ).getByStudyRunId(input.studyRunId);
  const terminalArtifact = isStudyRawExtractionArtifact(artifactRecord?.rawProposalJson)
    ? artifactRecord.rawProposalJson
    : null;

  const studyRunManifestPath = readerDocumentExtractionStudyRunManifestPath(
    sessionUserId,
    input.studyRunId,
  );
  const studyRunManifestRaw = await downloadJson<unknown>(gateway, studyRunManifestPath);
  const studyRunManifest = parseStudyRunManifest(studyRunManifestRaw);
  if (studyRunManifest && studyRunManifest.caseId !== input.caseId) {
    throw new RawExtractionNotFoundError();
  }

  const attemptId =
    terminalArtifact?.attemptId ?? studyRunManifest?.latestAttemptId ?? null;

  let attemptManifest: ReaderDocumentExtractionAttemptManifest | null = null;
  if (attemptId && studyRunManifest?.latestAttemptManifestObjectKey) {
    assertReaderDocumentExtractionAttemptManifestObjectKey({
      userId: sessionUserId,
      studyRunId: input.studyRunId,
      attemptId,
      objectKey: studyRunManifest.latestAttemptManifestObjectKey,
    });
    attemptManifest = parseAttemptManifest(
      await downloadJson<unknown>(gateway, studyRunManifest.latestAttemptManifestObjectKey),
    );
    if (attemptManifest && attemptManifest.caseId !== input.caseId) {
      throw new RawExtractionNotFoundError();
    }
  }

  const envelopesBySourceDocumentId = new Map<string, ReaderDocumentExtractionEnvelope>();
  if (attemptId && attemptManifest) {
    for (const row of attemptManifest.documents) {
      assertReaderDocumentExtractionEnvelopeObjectKey({
        userId: sessionUserId,
        studyRunId: input.studyRunId,
        attemptId,
        sourceDocumentId: row.sourceDocumentId,
        objectKey: row.envelopeObjectKey,
      });
      const raw = await downloadJson<unknown>(gateway, row.envelopeObjectKey);
      if (!raw) {
        continue;
      }
      const envelope = parseReaderDocumentExtractionEnvelope(raw);
      if (
        envelope.userId !== sessionUserId ||
        envelope.caseId !== input.caseId ||
        envelope.studyRunId !== input.studyRunId ||
        envelope.attemptId !== attemptId
      ) {
        throw new RawExtractionNotFoundError();
      }
      envelopesBySourceDocumentId.set(row.sourceDocumentId, envelope);
    }
  }

  const logicalDocuments =
    context?.structureMap?.logicalDocuments ?? context?.logicalDocuments ?? [];
  const fallbackSourceDocumentIds = [
    ...(context?.sourceDocuments.map((doc) => doc.sourceDocumentId) ?? []),
    ...(attemptManifest?.documents.map((doc) => doc.sourceDocumentId) ?? []),
    ...(terminalArtifact?.succeededDocumentIds ?? []),
    ...(terminalArtifact?.failedDocumentIds ?? []),
  ].filter((id): id is string => typeof id === "string" && id.trim().length > 0);

  const orderedSourceDocumentIds = orderSourceDocumentIdsForEngine1({
    logicalDocuments,
    fallbackSourceDocumentIds,
  });

  if (
    !hasRawExtractionArtifactEvidence({
      terminalArtifact,
      studyRunManifest,
      attemptManifest,
      envelopesBySourceDocumentId,
    })
  ) {
    throw new RawExtractionNotFoundError();
  }

  const bundle = buildRawExtractionInspectorBundle({
    caseId: input.caseId,
    studyRunId: input.studyRunId,
    studyRunStatus: run.status,
    attemptId,
    terminalArtifact,
    studyRunManifest,
    attemptManifest,
    envelopesBySourceDocumentId,
    orderedSourceDocumentIds,
    logicalDocuments,
  });

  return {
    ...bundle,
    intakeRunId: context?.intakeRunId ?? run.intakeRunId ?? null,
  };
}
