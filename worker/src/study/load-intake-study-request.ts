import { assembleIntakeStudyRequest, resolveIntakeStudyDomain } from "@hiveforyou/core";
import { parsePackExecution, refreshPackExecutionForStudy } from "@hiveforyou/intake";
import type { IntakeRunRecord } from "@hiveforyou/intake";
import type { StartCanonicalStudyRequest } from "@hiveforyou/shared/canonical-study";
import { NORMALIZED_EXTRACTION_SCHEMA_VERSION } from "@hiveforyou/shared/intake";

import type { WorkerIntakeRepository } from "../persistence/worker-intake-repository.js";
import type { WorkerSourceDocumentRepository } from "../intake/worker-source-documents.js";

export async function loadIntakeStudyRequest(input: {
  intake: WorkerIntakeRepository;
  documents: WorkerSourceDocumentRepository;
  userId: string;
  run: IntakeRunRecord;
}): Promise<StartCanonicalStudyRequest> {
  const { intake, documents, userId, run } = input;
  const identities = await intake.listByRun(userId, run.id);
  const sources = (await documents.listByCase(userId, run.caseId)).map((doc) => ({
    id: doc.id,
    originalFilename: doc.originalFilename ?? "Document",
    sizeBytes: doc.sizeBytes ?? 0,
    mimeType: doc.mimeType,
    sha256: doc.sha256,
    storageBucket: doc.storageBucket,
    storagePath: doc.storagePath,
  }));

  let packExecution = parsePackExecution(run.packExecutionJson);
  if (!packExecution) {
    throw new Error("INTAKE_PACK_EXECUTION_MISSING");
  }

  const domain = resolveIntakeStudyDomain({
    resolvedDomainId: run.resolvedDomainId,
    domainLabel: run.rawIntent ?? "Your documents",
  });
  if (!domain) {
    throw new Error("INTAKE_DOMAIN_UNRESOLVED");
  }

  const refreshed = await refreshPackExecutionForStudy({
    resolvedDomainId: domain.domainId,
    identities,
    sources,
    loadNormalized: async (sourceDocumentId, sourceHash) => {
      const normalized = await intake.getBySourceHash(userId, sourceDocumentId, sourceHash);
      if (
        !normalized ||
        normalized.schemaVersion !== NORMALIZED_EXTRACTION_SCHEMA_VERSION ||
        normalized.normalizedExtraction.schemaVersion !== NORMALIZED_EXTRACTION_SCHEMA_VERSION
      ) {
        return null;
      }
      return normalized.normalizedExtraction;
    },
  });
  if (refreshed) {
    packExecution = refreshed;
  }

  const studyRequest = assembleIntakeStudyRequest({
    caseId: run.caseId,
    intakeRunId: run.id,
    domainId: domain.domainId,
    domainLabel: domain.domainLabel,
    domainPackVersion: domain.domainPackVersion,
    packExecution,
    sources: sources as unknown as Parameters<typeof assembleIntakeStudyRequest>[0]["sources"],
    identities: identities.map((row) => ({
      sourceDocumentId: row.sourceDocumentId,
      analysisDisposition: row.analysisDisposition,
    })),
    statedWorkPurpose: run.rawIntent,
  });

  return studyRequest;
}
