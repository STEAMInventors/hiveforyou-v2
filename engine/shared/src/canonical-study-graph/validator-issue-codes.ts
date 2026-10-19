/**
 * Canonical Validator issue taxonomy (Phase B specification).
 *
 * L1 - schema and referential integrity (structure only).
 * L2 - source-backed observations (citation proves source existence, not semantics).
 * L3 - model-inferred semantics (relationships, resolutions, findings, absence scope).
 */

export const VALIDATION_LAYERS = ["L1", "L2", "L3"] as const;
export type ValidationLayer = (typeof VALIDATION_LAYERS)[number];

export const GRAPH_VALIDATOR_ISSUE_CODES = {
  // L1
  MALFORMED_PROPOSAL: "L1",
  UNKNOWN_OBSERVATION_ID: "L1",
  UNKNOWN_OBSERVABLE_ID: "L1",
  DUPLICATE_ID: "L1",
  BROKEN_REFERENCE: "L1",
  // L2
  SOURCE_OBSERVATION_INVALID: "L2",
  MISSING_EVIDENCE_LOCATOR: "L2",
  UNKNOWN_SOURCE_DOCUMENT: "L2",
  OBSERVATION_NOT_IN_SNAPSHOT: "L2",
  // L3
  SEMANTIC_SUPPORT_INSUFFICIENT: "L3",
  RELATIONSHIP_TYPE_NOT_IN_PACK: "L3",
  RELATIONSHIP_ENDPOINT_INVALID: "L3",
  ABSENCE_SCOPE_NOT_ESTABLISHED: "L3",
  CONFLICTING_EVIDENCE: "L3",
  UNSUPPORTED_IDENTITY_MERGE: "L3",
  INCOMPATIBLE_UNIT_OR_VALUE: "L3",
} as const;

export type GraphValidatorIssueCode = keyof typeof GRAPH_VALIDATOR_ISSUE_CODES;

export type GraphValidatorIssueSeverity = "fatal" | "reject" | "warning";

export type GraphValidatorIssue = {
  layer: ValidationLayer;
  code: GraphValidatorIssueCode;
  severity: GraphValidatorIssueSeverity;
  message: string;
  path?: string;
  relatedIds?: string[];
};

/** Acceptance matrix summary (enforced by validator implementation in Phase E). */
export const VALIDATOR_ACCEPTANCE_RULES = [
  {
    layer: "L1" as const,
    rule: "Proposal and accepted graph must match versioned JSON contracts and unique ids.",
  },
  {
    layer: "L2" as const,
    rule: "Every observation in the frozen snapshot has verified status, valid document evidence, and known sourceDocumentId.",
  },
  {
    layer: "L3" as const,
    rule: "Relationships, resolutions, and presence findings require pack-allowlisted types and supporting observation ids.",
  },
  {
    layer: "L3" as const,
    rule: "Absence findings require documentCoverageEstablished and searchScopeDeclared with a populated searchScope.",
  },
  {
    layer: "L3" as const,
    rule: "A valid citation alone does not prove a semantic link; insufficient support yields unresolved or rejected.",
  },
] as const;
