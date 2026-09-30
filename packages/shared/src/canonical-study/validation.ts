import type {
  ProposedClaim,
  ProposedConflict,
  ProposedDerivedClaimCandidate,
  ProposedEntity,
  ProposedEvent,
  ProposedMissingness,
  ProposedRelationship,
} from "./proposal";

export type ValidationIssueSeverity = "warning" | "reject" | "fatal";

export type ValidationIssue = {
  code: string;
  message: string;
  severity: ValidationIssueSeverity;
  /** When true, run may complete as NEEDS_REVIEW if no fatal issues. */
  requiresHumanAdjudication?: boolean;
  path?: string;
  relatedIds?: string[];
};

export type CanonicalStudyValidationResult = {
  status: "SUCCEEDED" | "NEEDS_REVIEW" | "FAILED";
  accepted: {
    entities: ProposedEntity[];
    claims: ProposedClaim[];
    relationships: ProposedRelationship[];
    events: ProposedEvent[];
    conflicts: ProposedConflict[];
    missingness: ProposedMissingness[];
    derivedClaimCandidates: ProposedDerivedClaimCandidate[];
  };
  rejected: ValidationIssue[];
  warnings: ValidationIssue[];
  /** Items needing explicit human adjudication per domain/core rules — not generic conflicts. */
  unresolved: ValidationIssue[];
  validationErrors: ValidationIssue[];
  provenanceErrors: ValidationIssue[];
  integrityErrors: ValidationIssue[];
};
