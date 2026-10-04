import type { DiscoverDomainResolutionStatus } from "./proposal";

export type DiscoverValidationIssueCode =
  | "INVALID_SCHEMA_VERSION"
  | "UNKNOWN_VOCABULARY"
  | "MISSING_PROVENANCE"
  | "UNKNOWN_SOURCE_DOCUMENT"
  | "UNKNOWN_PACK_EXPECTATION"
  | "INVALID_RELATIONSHIP"
  | "DUPLICATE_LOGICAL_DOCUMENT_ID"
  | "MALFORMED_PROPOSAL";

export type DiscoverValidationIssue = {
  code: DiscoverValidationIssueCode;
  message: string;
  path?: string;
};

export type HiveDiscoverValidationResult = {
  ok: boolean;
  issues: DiscoverValidationIssue[];
  preservedDomainResolutionStatus?: DiscoverDomainResolutionStatus;
};
