/** Ported from NestIEP `lib/scan/types.ts` (document identity slice). */

export const IEP_DOCUMENT_FAMILIES = [
  "REFERRAL",
  "EVAL_PLAN",
  "EVALUATION",
  "ELIGIBILITY",
  "MEETING",
  "PWN",
  "IEP",
  "PROGRESS",
  "SERVICES",
  "ACADEMIC",
  "BEHAVIOR",
  "EXTERNAL",
  "TRANSITION_EXIT",
  "OTHER",
  "OTHER_EDUCATIONAL",
] as const;

export type IepDocumentFamily = (typeof IEP_DOCUMENT_FAMILIES)[number];

export const IEP_TEMPORAL_ROLES = [
  "prior",
  "current",
  "intermediate",
  "sequence",
  "draft",
  "proposed",
  "unknown",
] as const;
export type IepTemporalRole = (typeof IEP_TEMPORAL_ROLES)[number];

export const IEP_COMPLETION_STATUSES = ["draft", "proposed", "completed", "unknown"] as const;
export type IepCompletionStatus = (typeof IEP_COMPLETION_STATUSES)[number];

export type IepScanPage = {
  pageNumber: number;
  text: string;
};

/** Minimal scan document shape for local classification (NestIEP-compatible). */
export type IepScanDocument = {
  scanDocumentId: string;
  originalDisplayName: string;
  mimeType: string;
  pageCount: number;
  pages: IepScanPage[];
  readStatus: "ok" | "unreadable" | "rejected" | "failed" | "needs_ocr";
  duplicateOfDocumentId?: string;
  sourceUploadId?: string;
  logicalStartPage?: number;
  logicalEndPage?: number;
};

export type IepLocalClassification = {
  documentId: string;
  family: IepDocumentFamily;
  subtype: string | null;
  documentDate: string | null;
  temporalRole: IepTemporalRole;
  documentStatus?: IepCompletionStatus;
  confidence: number;
  classificationReason: string;
};

export type IepLogicalDocumentSpan = {
  pageStart: number;
  pageEnd: number;
};

/** NestIEP port aliases (local classification modules). */
export type ScanDocument = IepScanDocument;
export type ScanPage = IepScanPage;
export type ScanDocumentFamily = IepDocumentFamily;
export type ScanClassification = IepLocalClassification;
export type ScanTemporalRole = IepTemporalRole;
export type ScanCompletionStatus = IepCompletionStatus;
