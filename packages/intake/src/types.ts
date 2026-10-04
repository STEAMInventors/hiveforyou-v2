import type {
  DocumentIdentityType,
  ExtractionStatus,
  IntakeDocumentStatus,
  IntakeRunStatus,
  NormalizedDocumentExtraction,
} from "@hiveforyou/shared/intake";

/** Page-level extraction. Identity is source, page, method, and source hash. */
export type ExtractionBoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Future Live Evidence-Trace regions (text + layout); optional until OCR/geometry lands. */
export type ExtractionRegion = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ExtractionPage = {
  pageNumber: number;
  text: string;
  /** Per-page method when known (e.g. pdf-native). Run-level method may also be set on the result. */
  extractionMethod?: string;
  boundingBoxes?: ExtractionBoundingBox[] | null;
  regions?: ExtractionRegion[];
};

export type DocumentExtractionResult = {
  documentId: string;
  extractionStatus: ExtractionStatus;
  text: string;
  pages: ExtractionPage[];
  extractionMethod: string | null;
  sourceHash: string;
  errorCode: string | null;
  /** Full NestIEP-equivalent recovered-page artifact when extraction ran. */
  normalizedExtraction: NormalizedDocumentExtraction | null;
};

export type DocumentNormalizedExtractionRecord = {
  id: string;
  userId: string;
  sourceDocumentId: string;
  sourceHash: string;
  schemaVersion: string;
  normalizedExtraction: NormalizedDocumentExtraction;
  createdAt: string;
};

export type IntakeSourceAnalysisDisposition = "PRESENT" | "DISCARDED";

export type IntakeStudyPath = "DOMAIN_PACK" | "GENERIC_STUDY";

export type IntakeRunRecord = {
  id: string;
  caseId: string;
  userId: string;
  idempotencyKey: string;
  status: IntakeRunStatus;
  classifier: "LOCAL";
  classifierVersion: string | null;
  startedAt: string;
  completedAt: string | null;
  errorCode: string | null;
  rawIntent: string | null;
  explicitDomainId: string | null;
  jevDomainProposal: string | null;
  jevDomainConfidence: number | null;
  resolvedDomainId: string | null;
  resolutionSource: "EXPLICIT" | "JEV" | "UNRESOLVED" | null;
  studyPath: IntakeStudyPath | null;
  packExecutionJson: string | null;
  /** Monotonic counter for append-source Inngest event ids (`intake:{runId}:{n}`). */
  intakeQueueSeq: number;
  createdAt: string;
  updatedAt: string;
};

export type DocumentIdentityRecord = {
  id: string;
  intakeRunId: string;
  sourceDocumentId: string;
  userId: string;
  caseId: string;
  processingStatus: IntakeDocumentStatus;
  proposedType: DocumentIdentityType | null;
  confidence: number | null;
  proposedBy: string | null;
  classifierVersion: string | null;
  returnedModel: string | null;
  classifiedAt: string | null;
  errorCode: string | null;
  analysisDisposition: IntakeSourceAnalysisDisposition;
  createdAt: string;
  updatedAt: string;
};

export type DocumentExtractionRecord = {
  id: string;
  userId: string;
  sourceDocumentId: string;
  pageNumber: number;
  extractionMethod: string;
  sourceHash: string;
  pageText: string;
  boundingBoxes: ExtractionBoundingBox[] | null;
  createdAt: string;
};

/** Bytes the job may see. Filename is intentionally absent. */
export type IntakeSourceDocument = {
  sourceDocumentId: string;
  mimeType: string | null;
  sha256: string;
  bytes: Uint8Array;
};
