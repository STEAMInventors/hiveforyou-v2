import type { ValidationIssue } from "../../canonical-study/validation";

import type {
  ProposedClaim,
  ProposedConflict,
  ProposedEntity,
  ProposedMissingInformation,
} from "./types";

export type CanonicalStudyValidationResultV3 = {
  status: "SUCCEEDED" | "NEEDS_REVIEW" | "FAILED";
  accepted: {
    entities: ProposedEntity[];
    claims: ProposedClaim[];
    conflicts: ProposedConflict[];
    missingInformation: ProposedMissingInformation[];
  };
  rejected: ValidationIssue[];
  warnings: ValidationIssue[];
  unresolved: ValidationIssue[];
  validationErrors: ValidationIssue[];
  provenanceErrors: ValidationIssue[];
  integrityErrors: ValidationIssue[];
};
