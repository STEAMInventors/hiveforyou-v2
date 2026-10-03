import "server-only";

import {
  findEvidenceReferenceInSnapshot,
  requireSessionUserId,
  resolveEvidenceReference,
} from "@hiveforyou/core";
import type { ResolvedEvidenceRef } from "@hiveforyou/shared/projections";

import { CaseNotFoundError } from "@/lib/canonical-study/study-service-server";
import { loadCanonicalCaseByStudyRunId } from "@/lib/case/load-case-by-study-run";
import { createSupabaseHiveGateway } from "@/lib/persistence/hive-gateway";
import { loadLatestStructureMapForCase } from "@/lib/persistence/supabase-case-projections";
import {
  SupabaseCaseRepository,
  SupabaseStudyRunRepository,
} from "@/lib/persistence/supabase-repositories";
import { SupabaseIntakeRepository } from "@/lib/persistence/supabase-intake";
import { createServerSupabaseClient, getAuthenticatedUserId } from "@/lib/supabase/server";

import { loadNormalizedExtractionForSource } from "./load-normalized-extraction.server";

export class EvidenceRefNotFoundError extends Error {
  readonly code = "EVIDENCE_REF_NOT_FOUND";

  constructor() {
    super("Evidence reference was not found on this study run.");
    this.name = "EvidenceRefNotFoundError";
  }
}

export class StudyRunNotFoundError extends Error {
  readonly code = "STUDY_RUN_NOT_FOUND";

  constructor() {
    super("Study run was not found.");
    this.name = "StudyRunNotFoundError";
  }
}

async function discardedSourceIds(
  intake: SupabaseIntakeRepository,
  userId: string,
  intakeRunId: string | undefined,
): Promise<Set<string>> {
  if (!intakeRunId) {
    return new Set();
  }
  const identities = await intake.listByRun(userId, intakeRunId);
  return new Set(
    identities
      .filter((row) => row.analysisDisposition === "DISCARDED")
      .map((row) => row.sourceDocumentId),
  );
}

export async function resolveEvidenceTraceForStudyRun(input: {
  studyRunId: string;
  evidenceRefId: string;
}): Promise<ResolvedEvidenceRef> {
  const sessionUserId = requireSessionUserId(await getAuthenticatedUserId());
  const gateway = createSupabaseHiveGateway(await createServerSupabaseClient());
  const runRepo = new SupabaseStudyRunRepository(gateway, sessionUserId);
  const run = await runRepo.getByStudyRunId(input.studyRunId);
  if (!run) {
    throw new StudyRunNotFoundError();
  }

  const cases = new SupabaseCaseRepository(gateway, sessionUserId);
  const ownedCase = await cases.getById(sessionUserId, run.caseId);
  if (!ownedCase) {
    throw new CaseNotFoundError();
  }

  const snapshot = await loadCanonicalCaseByStudyRunId({
    gateway,
    userId: sessionUserId,
    studyRunId: input.studyRunId,
  });
  if (!snapshot) {
    throw new StudyRunNotFoundError();
  }

  const located = findEvidenceReferenceInSnapshot(snapshot, input.evidenceRefId);
  if (!located) {
    throw new EvidenceRefNotFoundError();
  }

  const structureMap = await loadLatestStructureMapForCase(
    gateway,
    sessionUserId,
    run.caseId,
  );

  const intake = new SupabaseIntakeRepository(gateway, sessionUserId);
  const discarded = await discardedSourceIds(intake, sessionUserId, run.intakeRunId);

  const sourceDocumentId =
    located.ref.logicalDocumentId && structureMap
      ? structureMap.logicalDocuments.find((doc) => doc.id === located.ref.logicalDocumentId)
          ?.sourceDocumentId ?? located.ref.sourceDocumentId
      : located.ref.sourceDocumentId;

  const sourceMeta = snapshot.sourceDocuments.find(
    (doc) =>
      doc.sourceDocumentId === sourceDocumentId ||
      doc.stagedDocumentId === sourceDocumentId ||
      doc.discoveryDocumentId === sourceDocumentId,
  );

  let normalizedExtraction = null;
  if (sourceMeta?.sha256) {
    normalizedExtraction = await loadNormalizedExtractionForSource({
      intake,
      userId: sessionUserId,
      sourceHash: sourceMeta.sha256,
      candidateSourceDocumentIds: [
        sourceMeta.sourceDocumentId,
        sourceMeta.stagedDocumentId,
        sourceDocumentId,
        located.ref.sourceDocumentId,
      ].filter((id): id is string => Boolean(id)),
    });
  }

  return resolveEvidenceReference(located.ref, {
    structureMap,
    sourceDocuments: snapshot.sourceDocuments,
    normalizedExtraction,
    discardedSourceDocumentIds: discarded,
    claimId: located.claimId,
  });
}
