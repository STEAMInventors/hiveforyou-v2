/** Proposed document identity. This is not a case, domain, or disposition. */

export const DOCUMENT_IDENTITY_TYPES = [
  "bank_statement",
  "tax_return",
  "pay_stub",
  "bankruptcy_filing",
  "medicaid_document",
  "iep_document",
  "insurance_document",
  "certificate",
  "other",
] as const;

export type DocumentIdentityType = (typeof DOCUMENT_IDENTITY_TYPES)[number];

export const DOCUMENT_IDENTITY_LABELS: Record<DocumentIdentityType, string> = {
  bank_statement: "Bank statement",
  tax_return: "Tax return",
  pay_stub: "Pay stub",
  bankruptcy_filing: "Bankruptcy filing",
  medicaid_document: "Medicaid document",
  iep_document: "Special education document",
  insurance_document: "Insurance document",
  certificate: "Certificate",
  other: "Other document",
};

export const INTAKE_DOCUMENT_STATUSES = [
  "UPLOADED",
  "EXTRACTING",
  "NEEDS_OCR",
  "CLASSIFYING",
  "CLASSIFIED",
  "NEEDS_REVIEW",
  "FAILED",
] as const;

export type IntakeDocumentStatus = (typeof INTAKE_DOCUMENT_STATUSES)[number];

export const INTAKE_RUN_STATUSES = [
  "RUNNING",
  "SUCCEEDED",
  "NEEDS_REVIEW",
  "FAILED",
] as const;

export type IntakeRunStatus = (typeof INTAKE_RUN_STATUSES)[number];

export const EXTRACTION_STATUSES = ["SUCCEEDED", "NEEDS_OCR", "FAILED"] as const;

export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];

export const INTAKE_IDENTITY_CONFIG_ID = "document-identity-v1";

export const IDENTITY_SAMPLE_CHARS = 1000;

export const MIN_IDENTITY_TEXT_CHARS = 80;

/** Proposals below this confidence stay proposals and need review. */
export const IDENTITY_REVIEW_CONFIDENCE = 0.7;

export const INTAKE_CLASSIFIER = "LOCAL" as const;

export function isDocumentIdentityType(value: string): value is DocumentIdentityType {
  return (DOCUMENT_IDENTITY_TYPES as readonly string[]).includes(value);
}

export function documentIdentityLabel(type: DocumentIdentityType): string {
  return DOCUMENT_IDENTITY_LABELS[type];
}

export function isTerminalIntakeDocumentStatus(status: IntakeDocumentStatus): boolean {
  return (
    status === "NEEDS_OCR" ||
    status === "CLASSIFIED" ||
    status === "NEEDS_REVIEW" ||
    status === "FAILED"
  );
}

/** Customer-facing progress. Internal engine names stay out of this copy. */
export function intakeDocumentProgressCopy(status: IntakeDocumentStatus): string {
  switch (status) {
    case "UPLOADED":
    case "EXTRACTING":
      return "Reading…";
    case "CLASSIFYING":
      return "Identifying…";
    case "CLASSIFIED":
      return "Understood";
    case "NEEDS_OCR":
    case "NEEDS_REVIEW":
    case "FAILED":
      return "Needs your help";
    default: {
      const unreachable: never = status;
      return unreachable;
    }
  }
}
