import type { ReaderDocumentExtractionStatus } from "./reader-document-extraction.js";

export const PACK_DRIVEN_READER_RAW_ARTIFACT_SCHEMA_VERSION =
  "hive.pack-driven-reader-artifact-raw/1" as const;
export const PACK_DRIVEN_READER_VALIDATED_ARTIFACT_SCHEMA_VERSION =
  "hive.pack-driven-reader-artifact-validated/1" as const;
export const PACK_DRIVEN_READER_STUDY_MANIFEST_SCHEMA_VERSION =
  "hive.pack-driven-reader-artifact-manifest/1" as const;

export type PackDrivenReaderDocumentRawArtifact = {
  schemaVersion: typeof PACK_DRIVEN_READER_RAW_ARTIFACT_SCHEMA_VERSION;
  studyRunId: string;
  attemptId: string;
  caseId: string;
  userId: string;
  logicalDocumentId: string;
  sourceDocumentId: string;
  packId: string;
  packVersion: string;
  packContentSha256: string | null;
  promptVersion: string | null;
  promptCompilerVersion: string | null;
  modelProvider: string;
  modelId: string;
  occurredAt: string;
  extractionStatus: ReaderDocumentExtractionStatus;
  rawAssistantText?: string;
  parsedModelJson?: Record<string, unknown>;
  usage?: {
    inputTokens: number | null;
    outputTokens: number | null;
    cacheReadInputTokens: number | null;
    cacheWriteInputTokens: number | null;
  };
  latencyMs?: number;
  sanitizedError?: { code: string; message: string };
};

export type PackDrivenReaderValidatedFactRow = {
  fact: Record<string, unknown>;
  provenance: "quoted" | "classified" | "derived" | "unknown";
  rejectionReason?: string;
};

export type PackDrivenReaderDocumentValidatedArtifact = {
  schemaVersion: typeof PACK_DRIVEN_READER_VALIDATED_ARTIFACT_SCHEMA_VERSION;
  studyRunId: string;
  attemptId: string;
  caseId: string;
  userId: string;
  logicalDocumentId: string;
  sourceDocumentId: string;
  documentTypeId: string | null;
  discoverDocumentTypeId: string | null;
  discoverDocumentTypeLabel: string | null;
  parseOk: boolean;
  parseErrors: string[];
  needsReview: boolean;
  checklistCoverage: Array<{
    recordTypeId: string;
    disposition: string;
    instanceIndexes?: number[];
    note?: string | null;
  }>;
  recordInstances: unknown[];
  acceptedFacts: PackDrivenReaderValidatedFactRow[];
  rejectedFacts: PackDrivenReaderValidatedFactRow[];
  verificationOutcome: {
    acceptedCount: number;
    rejectedCount: number;
  };
  documentStatus: ReaderDocumentExtractionStatus;
  updatedAt: string;
};

export type PackDrivenReaderStudyManifestDocumentEntry = {
  logicalDocumentId: string;
  sourceDocumentId: string;
  rawArtifactPath: string;
  validatedArtifactPath: string;
  documentStatus: ReaderDocumentExtractionStatus;
  parseOk: boolean;
  acceptedFactCount: number;
  rejectedFactCount: number;
};

export type PackDrivenReaderStudyManifestArtifact = {
  schemaVersion: typeof PACK_DRIVEN_READER_STUDY_MANIFEST_SCHEMA_VERSION;
  studyRunId: string;
  attemptId: string;
  caseId: string;
  userId: string;
  packId: string;
  packVersion: string;
  packContentSha256: string | null;
  promptVersion: string | null;
  promptCompilerVersion: string | null;
  modelProvider: string;
  modelId: string;
  createdAt: string;
  complete: boolean;
  aggregateAcceptedFactCount: number;
  aggregateRejectedFactCount: number;
  documents: PackDrivenReaderStudyManifestDocumentEntry[];
};
