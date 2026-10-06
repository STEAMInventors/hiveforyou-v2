/** NestIEP Engine 1 recovered-page contract (domain-agnostic). */

export const NORMALIZED_EXTRACTION_SCHEMA_VERSION = "nestiep-recovered-document/1";

/** Bump when extraction output semantics change (cache invalidation + study provenance). */
export const NESTIEP_EXTRACTOR_VERSION = "nestiep-extractor/5";

export const NESTIEP_EXTRACTION_METHODS = ["NATIVE", "OCR"] as const;
export type NestIepExtractionMethod = (typeof NESTIEP_EXTRACTION_METHODS)[number];

export const NESTIEP_SOURCE_ISSUE_CODES = [
  "EMPTY_PAGE",
  "LOW_TEXT_RECOVERY",
  "OCR_REQUIRED",
  "OCR_FAILED",
  "OCR_UNAVAILABLE",
  "POSSIBLE_SCANNING_ARTIFACT",
  "CORRUPTED_PAGE",
  "UNREADABLE_DOCUMENT",
  "PARTIAL_TEXT_RECOVERY",
  "UNKNOWN_DOCUMENT_BOUNDARY",
  "PASSWORD_REQUIRED",
  "ENCRYPTED_PDF",
  "DUPLICATE_SOURCE_DOCUMENT",
  "UNSUPPORTED_FILE",
  "MAGIC_BYTE_MISMATCH",
  "PATH_OUTSIDE_INTAKE_ROOT",
] as const;

export type NestIepSourceIssueCode = (typeof NESTIEP_SOURCE_ISSUE_CODES)[number];

export const NESTIEP_SUPPORTED_FILE_KINDS = ["pdf", "jpeg", "png", "plain-text"] as const;
export type NestIepSupportedFileKind = (typeof NESTIEP_SUPPORTED_FILE_KINDS)[number];

export type NestIepBoundingBox = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type NestIepSourceIssue = {
  readonly code: NestIepSourceIssueCode;
  readonly message: string;
  readonly pageNumber?: number;
};

export type NestIepRecoveredLineSegment = {
  readonly text: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly boundingBox?: NestIepBoundingBox;
};

export type NestIepRecoveredLine = {
  readonly text: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly boundingBox?: NestIepBoundingBox;
  readonly order: number;
  /** Present when a visual line has multiple horizontal segments (e.g. table columns). */
  readonly segments?: readonly NestIepRecoveredLineSegment[];
};

export type NestIepRecoveredBlock = {
  readonly startOffset: number;
  readonly endOffset: number;
  readonly boundingBox?: NestIepBoundingBox;
  readonly lineIndexes: readonly number[];
};

export type NestIepPageQualityMetrics = {
  readonly characterCount: number;
  readonly meaningfulCharacterCount: number;
  readonly printableRatio: number;
  readonly garbageRatio: number;
  readonly duplicateTextRatio: number;
  readonly textItemCount: number;
  readonly estimatedCoverage: number;
  /** Null when the operator list was skipped (P1 fast path). */
  readonly imageOperatorCount: number | null;
};

export type NestIepPageQualityDecision = {
  readonly useOcr: boolean;
  readonly reasons: readonly string[];
  readonly metrics: NestIepPageQualityMetrics;
};

/** Pre-split recovered page (NestIEP Engine 1). */
export type NestIepRecoveredPage = {
  readonly runId: string;
  readonly sourceDocumentId: string;
  readonly pageNumber: number;
  readonly extractionMethod: NestIepExtractionMethod;
  readonly canonicalText: string;
  readonly lines: readonly NestIepRecoveredLine[];
  readonly blocks: readonly NestIepRecoveredBlock[];
  readonly sourceIssues: readonly NestIepSourceIssue[];
  readonly qualityDecision?: NestIepPageQualityDecision;
};

export type NormalizedDocumentExtractionStatistics = {
  readonly pageCount: number;
  readonly nativePageCount: number;
  readonly ocrPageCount: number;
  readonly operatorListSkippedPages?: number;
};

export type UnreadablePageRange = {
  readonly start: number;
  readonly end: number;
};

/** Full persisted extraction artifact for one source document + content hash. */
export type NormalizedDocumentExtraction = {
  readonly schemaVersion: typeof NORMALIZED_EXTRACTION_SCHEMA_VERSION;
  readonly extractorVersion: string;
  readonly sourceDocumentId: string;
  readonly sourceHash: string;
  readonly mimeType: string;
  readonly detectedKind: NestIepSupportedFileKind | "unknown";
  readonly statistics: NormalizedDocumentExtractionStatistics;
  readonly sourceIssues: readonly NestIepSourceIssue[];
  readonly unreadablePageRanges?: readonly UnreadablePageRange[];
  readonly pages: readonly NestIepRecoveredPage[];
};
