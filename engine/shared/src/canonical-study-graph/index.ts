export {
  CANONICAL_STUDY_GRAPH_SCHEMA_VERSION,
  CANONICAL_STUDY_GRAPH_VALIDATION_SCHEMA_VERSION,
  CANONICAL_STUDY_PROJECTION_MANIFEST_SCHEMA_VERSION,
  CANONICAL_STUDY_REASONER_PROPOSAL_SCHEMA_VERSION,
  FINDING_KINDS,
  GRAPH_VALIDATION_STATUSES,
  OBSERVATION_ROLES,
  OBSERVATION_SNAPSHOT_SCHEMA_VERSION,
  OBSERVATION_VERIFICATION_STATUSES,
  OBSERVABLE_IDENTITY_STATUSES,
  RESOLUTION_VALIDATION_OUTCOMES,
} from "./types.js";

export type {
  AbsenceScopeEstablishment,
  AbsenceSearchScope,
  AcceptedCanonicalStudyGraph,
  CanonicalStudyProjectionManifest,
  CanonicalStudyReasonerProposal,
  ConflictProposal,
  DerivedProjectionKind,
  DomainPackPin,
  FindingKind,
  FindingProposal,
  GraphValidationStatus,
  ObservationRole,
  ObservationSnapshot,
  ObservationValue,
  ObservationVerificationStatus,
  ObservableIdentityStatus,
  ProposedObservable,
  ReaderAcceptedFactsSourceRef,
  ReasonerModelPin,
  RelationshipProposal,
  ResolutionProposal,
  ResolutionValidationOutcome,
  SnapshotObservation,
  StudyAttemptPin,
  UnresolvedGraphProposal,
  ValidatedConflict,
  ValidatedFinding,
  ValidatedObservable,
  ValidatedRelationship,
  ValidatedResolution,
} from "./types.js";

export type {
  CanonicalStudyGraphValidationResult,
  GraphValidationAcceptedPartition,
} from "./validation-result.js";

export {
  GRAPH_VALIDATOR_ISSUE_CODES,
  VALIDATION_LAYERS,
  VALIDATOR_ACCEPTANCE_RULES,
} from "./validator-issue-codes.js";
export type {
  GraphValidatorIssue,
  GraphValidatorIssueCode,
  GraphValidatorIssueSeverity,
  ValidationLayer,
} from "./validator-issue-codes.js";

export {
  ACCEPTED_CANONICAL_STUDY_GRAPH_JSON_SCHEMA,
  CANONICAL_STUDY_GRAPH_VALIDATION_JSON_SCHEMA,
  CANONICAL_STUDY_PROJECTION_MANIFEST_JSON_SCHEMA,
  CANONICAL_STUDY_REASONER_PROPOSAL_JSON_SCHEMA,
  OBSERVATION_SNAPSHOT_JSON_SCHEMA,
} from "./json-schema.js";
export type { JsonSchema } from "./json-schema.js";

export {
  assertAbsenceFindingAcceptedShape,
  assertAbsenceFindingProposedShape,
  isAbsenceFindingAcceptable,
  validateAcceptedCanonicalStudyGraph,
  validateCanonicalStudyGraphValidationResult,
  validateCanonicalStudyProjectionManifest,
  validateCanonicalStudyReasonerProposal,
  validateObservationSnapshot,
} from "./validate.js";
export type { ContractValidationResult, ContractViolation } from "./validate.js";

export type { CanonicalStudyGraphPersistenceSlots } from "./run-lifecycle.js";
export { describeGraphPersistenceSlots } from "./run-lifecycle.js";

export type {
  CanonicalStudyReasoner,
  CanonicalStudyReasonerRequest,
  VerifiedReaderToObservationSnapshotAdapter,
} from "./reasoner-port.js";
