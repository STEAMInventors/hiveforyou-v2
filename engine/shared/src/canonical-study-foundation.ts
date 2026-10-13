import type { ReaderDocumentExtractionStatus } from "./reader-document-extraction.js";

export const CANONICAL_STUDY_FOUNDATION_SCHEMA_VERSION =
  "hive.canonical-study-foundation/1" as const;

/** Extraction outcome carried into canonical study (includes missing envelope). */
export type CanonicalStudyDocumentExtractionStatus =
  | ReaderDocumentExtractionStatus
  | "MISSING_ENVELOPE";

/** Model or trusted classification for a source document. */
export type CanonicalStudyDocumentClassificationStatus =
  | "classified"
  | "unknown"
  | "ambiguous"
  | "unclassified";

export type CanonicalStudyFoundationEvidence = {
  sourceDocumentId: string;
  page: number;
  quote: string;
  spanStart?: number;
  spanEnd?: number;
  wordStartIndex?: number;
  wordEndIndex?: number;
};

export type CanonicalStudyFoundationEnvelopeRef = {
  studyRunId: string;
  attemptId: string;
  sourceDocumentId: string;
  envelopeStatus: string;
};

export type CanonicalStudyFoundationFieldDisposition = "verified" | "rejected" | "unresolved";

export type CanonicalStudyFoundationNormalizedValue = {
  valueKind: string;
  displayValue: unknown;
  normalizedValue: unknown;
  unit?: string | null;
};

export type CanonicalStudyFoundationProposedField = {
  fieldKey: string;
  sourceDocumentId: string;
  recordTypeId: string;
  instanceIndex: number;
  fieldId: string;
  documentTypeId: string | null;
  valueKind: string;
  provenance: string;
  modality: string;
  missingState: string | null;
  displayValue: unknown;
  evidence: CanonicalStudyFoundationEvidence | null;
  envelopeRef: CanonicalStudyFoundationEnvelopeRef;
  parseErrors: string[];
};

export type CanonicalStudyFoundationGroupedRecord = {
  recordGroupId: string;
  sourceDocumentId: string;
  recordTypeId: string;
  instanceIndex: number;
  fieldKeys: string[];
};

export type CanonicalStudyFoundationVerifiedField = CanonicalStudyFoundationProposedField & {
  disposition: "verified";
  verifiedEvidence: CanonicalStudyFoundationEvidence[];
  normalized: CanonicalStudyFoundationNormalizedValue;
  reasons: [];
};

export type CanonicalStudyFoundationRejectedField = CanonicalStudyFoundationProposedField & {
  disposition: "rejected";
  reasons: string[];
};

export type CanonicalStudyFoundationUnresolvedField = CanonicalStudyFoundationProposedField & {
  disposition: "unresolved";
  reasons: string[];
};

export type CanonicalStudyFoundationFieldOutcome =
  | CanonicalStudyFoundationVerifiedField
  | CanonicalStudyFoundationRejectedField
  | CanonicalStudyFoundationUnresolvedField;

export type CanonicalStudyFoundationDocumentOrder = {
  sourceDocumentId: string;
  documentTypeId: string | null;
  authorRoleId: string | null;
  party: string | null;
  verifiedOrderingDate: string | null;
  orderingDateFieldPath: string | null;
  sortRank: number;
  extractionStatus: CanonicalStudyDocumentExtractionStatus;
  classificationStatus: CanonicalStudyDocumentClassificationStatus;
  trustedPagesSupplied: boolean;
  matchedPageTerms: string[];
  amendsDocumentTypeId: string | null;
  amendmentLinkStatus: "linked" | "unresolved" | "not_applicable";
  amendmentTargetSourceDocumentId: string | null;
};

export type CanonicalStudyFoundationUnresolvedItem = {
  id: string;
  kind:
    | "extraction_unavailable"
    | "parse_failure"
    | "missing_ordering_date"
    | "amendment_link_unresolved"
    | "unsupported_derivation"
    | "derived_operand_unverified"
    | "orphan_record";
  message: string;
  sourceDocumentId?: string;
  fieldKey?: string;
  recordGroupId?: string;
};

export type CanonicalStudyFoundationCounts = {
  proposed: number;
  verified: number;
  rejected: number;
  unresolved: number;
};

export type CanonicalStudyFoundationArtifactBody = {
  schemaVersion: typeof CANONICAL_STUDY_FOUNDATION_SCHEMA_VERSION;
  packId: string;
  packVersion: string;
  packContentSha256: string;
  studyRunId: string;
  attemptId: string;
  caseId: string;
  counts: CanonicalStudyFoundationCounts;
  documents: CanonicalStudyFoundationDocumentOrder[];
  groupedRecords: CanonicalStudyFoundationGroupedRecord[];
  verifiedFields: CanonicalStudyFoundationVerifiedField[];
  rejectedFields: CanonicalStudyFoundationRejectedField[];
  unresolvedFields: CanonicalStudyFoundationUnresolvedField[];
  unresolvedItems: CanonicalStudyFoundationUnresolvedItem[];
};

export type CanonicalStudyFoundationArtifact = CanonicalStudyFoundationArtifactBody & {
  createdAt: string;
  contentSha256: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function parseCanonicalStudyFoundationArtifact(raw: unknown): CanonicalStudyFoundationArtifact {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("CANONICAL_STUDY_FOUNDATION_INVALID: expected object");
  }
  const record = raw as Record<string, unknown>;
  if (record.schemaVersion !== CANONICAL_STUDY_FOUNDATION_SCHEMA_VERSION) {
    throw new Error("CANONICAL_STUDY_FOUNDATION_INVALID: schemaVersion");
  }
  if (!isNonEmptyString(record.packId)) {
    throw new Error("CANONICAL_STUDY_FOUNDATION_INVALID: packId");
  }
  if (!isNonEmptyString(record.packVersion)) {
    throw new Error("CANONICAL_STUDY_FOUNDATION_INVALID: packVersion");
  }
  if (!isNonEmptyString(record.packContentSha256)) {
    throw new Error("CANONICAL_STUDY_FOUNDATION_INVALID: packContentSha256");
  }
  if (!isNonEmptyString(record.studyRunId)) {
    throw new Error("CANONICAL_STUDY_FOUNDATION_INVALID: studyRunId");
  }
  if (!isNonEmptyString(record.attemptId)) {
    throw new Error("CANONICAL_STUDY_FOUNDATION_INVALID: attemptId");
  }
  if (!isNonEmptyString(record.caseId)) {
    throw new Error("CANONICAL_STUDY_FOUNDATION_INVALID: caseId");
  }
  if (!isNonEmptyString(record.createdAt)) {
    throw new Error("CANONICAL_STUDY_FOUNDATION_INVALID: createdAt");
  }
  if (!isNonEmptyString(record.contentSha256)) {
    throw new Error("CANONICAL_STUDY_FOUNDATION_INVALID: contentSha256");
  }
  const counts = record.counts;
  if (!counts || typeof counts !== "object") {
    throw new Error("CANONICAL_STUDY_FOUNDATION_INVALID: counts");
  }
  return raw as CanonicalStudyFoundationArtifact;
}
