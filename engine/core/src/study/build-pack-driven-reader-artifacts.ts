import {
  PACK_DRIVEN_READER_PROMPT_VERSION,
  parseAndValidatePackDrivenExtraction,
  type ProposalDomainPack,
} from "@hiveforyou/domain-pack/pack-driven-reader";
import type {
  PackDrivenReaderDocumentRawArtifact,
  PackDrivenReaderDocumentValidatedArtifact,
  PackDrivenReaderStudyManifestArtifact,
  PackDrivenReaderStudyManifestDocumentEntry,
  PackDrivenReaderValidatedFactRow,
} from "@hiveforyou/shared/pack-driven-reader-artifacts";
import {
  packDrivenReaderDocumentRawArtifactPath,
  packDrivenReaderDocumentValidatedArtifactPath,
} from "@hiveforyou/shared/hive-artifact-paths";
import type { ReaderDocumentExtractionEnvelope } from "@hiveforyou/shared/reader-document-extraction";

function factKey(fact: Record<string, unknown>): string {
  return JSON.stringify(fact);
}

function partitionCandidateFacts(input: {
  candidateFacts: unknown[];
  acceptedCandidateFacts: unknown[];
}): { accepted: PackDrivenReaderValidatedFactRow[]; rejected: PackDrivenReaderValidatedFactRow[] } {
  const acceptedKeys = new Set(
    input.acceptedCandidateFacts
      .filter((row): row is Record<string, unknown> => !!row && typeof row === "object" && !Array.isArray(row))
      .map((row) => factKey(row)),
  );
  const accepted: PackDrivenReaderValidatedFactRow[] = [];
  const rejected: PackDrivenReaderValidatedFactRow[] = [];

  for (const raw of input.candidateFacts) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      continue;
    }
    const fact = raw as Record<string, unknown>;
    const provenanceRaw = fact.provenance ?? fact.proposalProvenance;
    const provenance =
      provenanceRaw === "quoted" || provenanceRaw === "classified" || provenanceRaw === "derived"
        ? provenanceRaw
        : "unknown";
    const rejectionReason =
      typeof fact.rejectionReason === "string"
        ? fact.rejectionReason
        : typeof fact.verifierRejectionReason === "string"
          ? fact.verifierRejectionReason
          : undefined;
    const row: PackDrivenReaderValidatedFactRow = {
      fact,
      provenance,
      ...(rejectionReason ? { rejectionReason } : {}),
    };
    if (acceptedKeys.has(factKey(fact))) {
      accepted.push(row);
    } else {
      rejected.push(row);
    }
  }

  return { accepted, rejected };
}

export function buildPackDrivenReaderDocumentRawArtifact(input: {
  envelope: ReaderDocumentExtractionEnvelope;
  logicalDocumentId: string;
  promptCompilerVersion?: string | null;
}): PackDrivenReaderDocumentRawArtifact {
  return {
    schemaVersion: "hive.pack-driven-reader-artifact-raw/1",
    studyRunId: input.envelope.studyRunId,
    attemptId: input.envelope.attemptId,
    caseId: input.envelope.caseId,
    userId: input.envelope.userId,
    logicalDocumentId: input.logicalDocumentId,
    sourceDocumentId: input.envelope.sourceDocumentId,
    packId: input.envelope.packId,
    packVersion: input.envelope.packVersion,
    packContentSha256: input.envelope.packContentSha256,
    promptVersion: input.envelope.promptVersion,
    promptCompilerVersion: input.promptCompilerVersion ?? PACK_DRIVEN_READER_PROMPT_VERSION,
    modelProvider: input.envelope.modelProvider,
    modelId: input.envelope.modelId,
    occurredAt: input.envelope.occurredAt,
    extractionStatus: input.envelope.status,
    ...(input.envelope.rawAssistantText ? { rawAssistantText: input.envelope.rawAssistantText } : {}),
    ...(input.envelope.parsedModelJson ? { parsedModelJson: input.envelope.parsedModelJson } : {}),
    ...(input.envelope.usage ? { usage: input.envelope.usage } : {}),
    ...(input.envelope.latencyMs !== undefined ? { latencyMs: input.envelope.latencyMs } : {}),
    ...(input.envelope.sanitizedError ? { sanitizedError: input.envelope.sanitizedError } : {}),
  };
}

export function buildPackDrivenReaderDocumentValidatedArtifact(input: {
  envelope: ReaderDocumentExtractionEnvelope;
  logicalDocumentId: string;
  pack: ProposalDomainPack;
  perDocumentWire: Record<string, unknown> | null;
  discoverDocumentTypeId?: string | null;
  discoverDocumentTypeLabel?: string | null;
  updatedAt: string;
}): PackDrivenReaderDocumentValidatedArtifact {
  const parsedModelJson = input.envelope.parsedModelJson ?? null;
  const parseResult =
    parsedModelJson != null
      ? parseAndValidatePackDrivenExtraction({
          pack: input.pack,
          raw: parsedModelJson,
          expectedSourceDocumentId: input.envelope.sourceDocumentId,
        })
      : {
          ok: false,
          needsReview: true,
          documentTypeId: null,
          documentTypeResolved: null,
          extractionSchemaVersion: null,
          errors: ["parsedModelJson missing"],
          checklistCoverage: [],
          recordInstances: [],
        };

  const candidateFacts = Array.isArray(input.perDocumentWire?.candidateFacts)
    ? (input.perDocumentWire!.candidateFacts as unknown[])
    : [];
  const acceptedCandidateFacts = Array.isArray(input.perDocumentWire?.acceptedCandidateFacts)
    ? (input.perDocumentWire!.acceptedCandidateFacts as unknown[])
    : [];
  const { accepted, rejected } = partitionCandidateFacts({ candidateFacts, acceptedCandidateFacts });

  const parseErrors = [
    ...parseResult.errors,
    ...(Array.isArray(input.perDocumentWire?.parseErrors)
      ? (input.perDocumentWire!.parseErrors as unknown[]).map(String)
      : []),
  ];
  const parseOk = input.perDocumentWire?.parseOk === false ? false : parseResult.ok;

  return {
    schemaVersion: "hive.pack-driven-reader-artifact-validated/1",
    studyRunId: input.envelope.studyRunId,
    attemptId: input.envelope.attemptId,
    caseId: input.envelope.caseId,
    userId: input.envelope.userId,
    logicalDocumentId: input.logicalDocumentId,
    sourceDocumentId: input.envelope.sourceDocumentId,
    documentTypeId: parseResult.documentTypeId,
    discoverDocumentTypeId: input.discoverDocumentTypeId ?? null,
    discoverDocumentTypeLabel: input.discoverDocumentTypeLabel ?? null,
    parseOk,
    parseErrors,
    needsReview: parseResult.needsReview || input.perDocumentWire?.classificationNeedsReview === true,
    checklistCoverage: parseResult.checklistCoverage.map((item) => ({
      recordTypeId: item.recordTypeId,
      disposition: item.disposition,
      ...(item.instanceIndexes ? { instanceIndexes: item.instanceIndexes } : {}),
      ...(item.note !== undefined ? { note: item.note ?? null } : {}),
    })),
    recordInstances: parseResult.recordInstances,
    acceptedFacts: accepted,
    rejectedFacts: rejected,
    verificationOutcome: {
      acceptedCount: accepted.length,
      rejectedCount: rejected.length,
    },
    documentStatus: input.envelope.status,
    updatedAt: input.updatedAt,
  };
}

export function buildPackDrivenReaderStudyManifestArtifact(input: {
  userId: string;
  attemptId: string;
  envelopes: ReaderDocumentExtractionEnvelope[];
  validatedByLogicalDocumentId: Map<string, PackDrivenReaderDocumentValidatedArtifact>;
  logicalDocumentIdBySourceDocumentId: Map<string, string>;
  promptCompilerVersion?: string | null;
  createdAt: string;
  complete: boolean;
}): PackDrivenReaderStudyManifestArtifact {
  if (input.envelopes.length === 0) {
    throw new Error("PACK_DRIVEN_READER_MANIFEST_EMPTY");
  }
  const head = input.envelopes[0]!;
  const documents: PackDrivenReaderStudyManifestDocumentEntry[] = [];
  let aggregateAccepted = 0;
  let aggregateRejected = 0;

  for (const envelope of input.envelopes) {
    const logicalDocumentId =
      input.logicalDocumentIdBySourceDocumentId.get(envelope.sourceDocumentId) ??
      envelope.sourceDocumentId;
    const validated = input.validatedByLogicalDocumentId.get(logicalDocumentId);
    if (!validated) {
      throw new Error(`PACK_DRIVEN_READER_VALIDATED_MISSING:${logicalDocumentId}`);
    }
    aggregateAccepted += validated.verificationOutcome.acceptedCount;
    aggregateRejected += validated.verificationOutcome.rejectedCount;
    documents.push({
      logicalDocumentId,
      sourceDocumentId: envelope.sourceDocumentId,
      rawArtifactPath: packDrivenReaderDocumentRawArtifactPath(
        input.userId,
        envelope.studyRunId,
        logicalDocumentId,
      ),
      validatedArtifactPath: packDrivenReaderDocumentValidatedArtifactPath(
        input.userId,
        envelope.studyRunId,
        logicalDocumentId,
      ),
      documentStatus: envelope.status,
      parseOk: validated.parseOk,
      acceptedFactCount: validated.verificationOutcome.acceptedCount,
      rejectedFactCount: validated.verificationOutcome.rejectedCount,
    });
  }

  return {
    schemaVersion: "hive.pack-driven-reader-artifact-manifest/1",
    studyRunId: head.studyRunId,
    attemptId: input.attemptId,
    caseId: head.caseId,
    userId: input.userId,
    packId: head.packId,
    packVersion: head.packVersion,
    packContentSha256: head.packContentSha256,
    promptVersion: head.promptVersion,
    promptCompilerVersion: input.promptCompilerVersion ?? PACK_DRIVEN_READER_PROMPT_VERSION,
    modelProvider: head.modelProvider,
    modelId: head.modelId,
    createdAt: input.createdAt,
    complete: input.complete,
    aggregateAcceptedFactCount: aggregateAccepted,
    aggregateRejectedFactCount: aggregateRejected,
    documents,
  };
}
