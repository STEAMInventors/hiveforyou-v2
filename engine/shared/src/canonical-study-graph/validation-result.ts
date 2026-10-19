import type { GraphValidationStatus } from "./types.js";
import type { GraphValidatorIssue } from "./validator-issue-codes.js";
import type {
  AcceptedCanonicalStudyGraph,
  ValidatedConflict,
  ValidatedFinding,
  ValidatedObservable,
  ValidatedRelationship,
  ValidatedResolution,
} from "./types.js";
import { CANONICAL_STUDY_GRAPH_VALIDATION_SCHEMA_VERSION } from "./types.js";

export type GraphValidationAcceptedPartition = {
  observables: ValidatedObservable[];
  relationships: ValidatedRelationship[];
  resolutions: ValidatedResolution[];
  conflicts: ValidatedConflict[];
  findings: ValidatedFinding[];
};

export type CanonicalStudyGraphValidationResult = {
  schemaVersion: typeof CANONICAL_STUDY_GRAPH_VALIDATION_SCHEMA_VERSION;
  studyRunId: string;
  attemptId: string;
  status: GraphValidationStatus;
  accepted: GraphValidationAcceptedPartition;
  rejected: GraphValidatorIssue[];
  unresolved: GraphValidatorIssue[];
  /** Accepted authoritative graph when status is SUCCEEDED or NEEDS_REVIEW. */
  acceptedGraph?: AcceptedCanonicalStudyGraph;
};
