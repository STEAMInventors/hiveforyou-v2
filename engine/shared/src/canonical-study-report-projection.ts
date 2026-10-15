import type { CanonicalStudyProvenanceChip } from "./canonical-study-artifact.js";

export const CANONICAL_STUDY_REPORT_PROJECTION_SCHEMA_VERSION =
  "canonical-study-report/1" as const;

export type CanonicalStudyReportAudience = "customer" | "pro";

/** Slice 1 uses deterministic ordering only; Slice 2 may supply writer-validated narrative. */
export type CanonicalStudyReportNarrativeSource = "deterministic" | "writer_validated";

export type CanonicalStudyReportPresentationMode = "approved" | "internal_preview";

export type CanonicalStudyReportClaimRef = {
  /** Stable canonical claim id (provenance fieldKey). */
  fieldKey: string;
  /** Optional secondary ids for relations, flags, requirements, series. */
  contextId?: string;
  contextKind?:
    | "provenance_chip"
    | "relation"
    | "requirement"
    | "flag"
    | "series_observation"
    | "unresolved_item"
    | "unresolved_comparison";
};

export type CanonicalStudyReportAssertionKind =
  | "verified_quoted"
  | "derived"
  | "classified"
  | "unresolved";

export type CanonicalStudyReportEvidenceChip = {
  claimRef: CanonicalStudyReportClaimRef;
  sourceDocumentId: string;
  page: number;
  quote: string;
  provenanceClass: string;
};

export type CanonicalStudyReportFactLine = {
  claimRef: CanonicalStudyReportClaimRef;
  entityId: string | null;
  recordTypeId: string;
  fieldId: string;
  sourceDocumentId: string;
  displayText: string;
  assertionKind: CanonicalStudyReportAssertionKind;
  evidence: CanonicalStudyReportEvidenceChip[];
};

export type CanonicalStudyReportChangeRow = {
  relationId: string;
  entityId: string;
  fieldId: string;
  label: "CHANGE";
  left: CanonicalStudyReportFactLine;
  right: CanonicalStudyReportFactLine;
  temporalBasis: string | null;
};

export type CanonicalStudyReportSupportRow = {
  relationId: string;
  label: "MATCHES" | "UNCHANGED";
  left: CanonicalStudyReportFactLine;
  right: CanonicalStudyReportFactLine;
};

export type CanonicalStudyReportOpenQuestion = {
  id: string;
  kind: "flag" | "unresolved_item" | "unresolved_comparison" | "identity_unresolved" | "requirement";
  title: string;
  detail: string;
  claimRefs: CanonicalStudyReportClaimRef[];
};

export type CanonicalStudyReportStorySection = {
  id: string;
  sortRank: number;
  sourceDocumentId: string;
  documentTypeId: string | null;
  orderingDate: string | null;
  title: string;
  facts: CanonicalStudyReportFactLine[];
};

export type CanonicalStudyReportCustomerBody = {
  storySections: CanonicalStudyReportStorySection[];
  importantFacts: CanonicalStudyReportFactLine[];
  changes: CanonicalStudyReportChangeRow[];
  supports: CanonicalStudyReportSupportRow[];
  openQuestions: CanonicalStudyReportOpenQuestion[];
};

export type CanonicalStudyReportProLedgerRow = CanonicalStudyReportFactLine & {
  entityStatus: string | null;
  instanceIndex: number;
  envelopeRef: CanonicalStudyProvenanceChip["envelopeRef"];
};

export type CanonicalStudyReportProQuotation = {
  claimRef: CanonicalStudyReportClaimRef;
  sourceDocumentId: string;
  page: number;
  quote: string;
  fieldId: string;
  recordTypeId: string;
};

export type CanonicalStudyReportProRelationRow = {
  id: string;
  label: string;
  entityId: string;
  fieldId: string;
  leftFieldKey: string;
  rightFieldKey: string;
  temporalBasis: string | null;
  partyBasis: string | null;
};

export type CanonicalStudyReportProOperativeView = {
  id: string;
  baseDocumentTypeId: string;
  baseSourceDocumentId: string;
  status: string;
  recordCount: number;
  unresolvedItemIds: string[];
};

export type CanonicalStudyReportProRequirementRow = {
  id: string;
  ruleId: string;
  outcome: string;
  scope: string;
  message: string;
  claimRefs: CanonicalStudyReportClaimRef[];
};

export type CanonicalStudyReportProFlagRow = {
  id: string;
  checkId: string;
  status: string;
  question: string;
  message: string;
  claimRefs: CanonicalStudyReportClaimRef[];
};

export type CanonicalStudyReportProSeriesRow = {
  id: string;
  entityId: string;
  constructId: string;
  dimensionKey: string;
  observationCount: number;
  unresolvedReasons: string[];
  claimRefs: CanonicalStudyReportClaimRef[];
};

export type CanonicalStudyReportProExportTable = {
  name: string;
  columns: string[];
  rows: string[][];
};

export type CanonicalStudyReportProBody = {
  entityLedger: CanonicalStudyReportProLedgerRow[];
  quotations: CanonicalStudyReportProQuotation[];
  relations: CanonicalStudyReportProRelationRow[];
  operativeViews: CanonicalStudyReportProOperativeView[];
  requirements: CanonicalStudyReportProRequirementRow[];
  flags: CanonicalStudyReportProFlagRow[];
  measurementSeries: CanonicalStudyReportProSeriesRow[];
  exportTables: CanonicalStudyReportProExportTable[];
};

export type CanonicalStudyReportProjectionMeta = {
  schemaVersion: typeof CANONICAL_STUDY_REPORT_PROJECTION_SCHEMA_VERSION;
  audience: CanonicalStudyReportAudience;
  presentationMode: CanonicalStudyReportPresentationMode;
  customerProReportsPermitted: boolean;
  packApprovalLabel: string;
  packId: string;
  packVersion: string;
  narrativeSource: CanonicalStudyReportNarrativeSource;
  sourceArtifactContentSha256: string;
  studyRunId: string;
  caseId: string;
  /** Reserved for Slice 2 writer-proposed UI tree ordering (validated separately). */
  uiTreeVersion?: string | null;
};

export type CanonicalStudyReportProjection = CanonicalStudyReportProjectionMeta &
  (
    | { audience: "customer"; body: CanonicalStudyReportCustomerBody }
    | { audience: "pro"; body: CanonicalStudyReportProBody }
  );

export type CanonicalStudyReportPublicationInput = {
  customerProReportsPermitted: boolean;
  packApprovalLabel: string;
};

export function resolveCanonicalStudyReportPresentationMode(
  input: CanonicalStudyReportPublicationInput,
): CanonicalStudyReportPresentationMode {
  if (
    input.customerProReportsPermitted === true &&
    input.packApprovalLabel.trim().length > 0 &&
    input.packApprovalLabel !== "DEBUG_UNAPPROVED_PACK"
  ) {
    return "approved";
  }
  return "internal_preview";
}
