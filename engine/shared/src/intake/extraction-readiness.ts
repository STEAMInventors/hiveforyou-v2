import type { NestIepSourceIssueCode } from "./normalized-extraction";

export type ExtractionReadinessDocumentStatus = "PARTIAL" | "NEEDS_OCR";

export type ExtractionReadinessLogicalPageRange = {
  readonly logicalDocumentId: string;
  readonly pageStart: number;
  readonly pageEnd: number;
};

export type ExtractionReadinessUnreadableRange = {
  readonly id: string;
  readonly sourcePageStart: number;
  readonly sourcePageEnd: number;
  readonly reasonCodes: readonly NestIepSourceIssueCode[];
  readonly logicalDocuments: readonly ExtractionReadinessLogicalPageRange[];
};

export type ExtractionReadinessDocument = {
  readonly sourceDocumentId: string;
  readonly filename: string;
  readonly status: ExtractionReadinessDocumentStatus;
  readonly unreadableRanges: readonly ExtractionReadinessUnreadableRange[];
};

/** Deterministic extraction coverage for Engine 2 — no model involvement. */
export type ExtractionReadiness = {
  readonly schemaVersion: "extraction-readiness/1";
  readonly documents: readonly ExtractionReadinessDocument[];
};
