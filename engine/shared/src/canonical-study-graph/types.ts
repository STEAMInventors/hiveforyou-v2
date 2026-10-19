import type { EffectivePeriod, EvidenceReference } from "../case-intelligence/3/types.js";
import type { ClaimValue } from "../case-intelligence/3/types.js";

/** Authoritative accepted canonical case graph (not a compatibility projection). */
export const CANONICAL_STUDY_GRAPH_SCHEMA_VERSION = "hive.canonical-study-graph/1" as const;

/** Immutable normalized Reader output for one study attempt. */
export const OBSERVATION_SNAPSHOT_SCHEMA_VERSION = "hive.observation-snapshot/1" as const;

/** Untrusted model output from the Canonical Reasoner. */
export const CANONICAL_STUDY_REASONER_PROPOSAL_SCHEMA_VERSION =
  "canonical-study-reasoner-proposal/1" as const;

/** Deterministic validator output partitioning accepted / rejected / unresolved graph items. */
export const CANONICAL_STUDY_GRAPH_VALIDATION_SCHEMA_VERSION =
  "canonical-study-graph-validation/1" as const;

/** Lineage record for a derived, read-only projection from an accepted graph. */
export const CANONICAL_STUDY_PROJECTION_MANIFEST_SCHEMA_VERSION =
  "hive.canonical-study-projection-manifest/1" as const;

export const OBSERVATION_VERIFICATION_STATUSES = ["verified"] as const;
export type ObservationVerificationStatus = (typeof OBSERVATION_VERIFICATION_STATUSES)[number];

/** Modality / temporal role of a source-backed observation (distinct values must not be merged silently). */
export const OBSERVATION_ROLES = [
  "baseline",
  "target",
  "planned",
  "actual",
  "observed",
  "historical",
  "current",
  "superseded",
  "unknown",
] as const;
export type ObservationRole = (typeof OBSERVATION_ROLES)[number];

export const OBSERVABLE_IDENTITY_STATUSES = ["resolved", "provisional", "unresolved"] as const;
export type ObservableIdentityStatus = (typeof OBSERVABLE_IDENTITY_STATUSES)[number];

export const RESOLUTION_VALIDATION_OUTCOMES = ["accepted", "rejected", "unresolved"] as const;
export type ResolutionValidationOutcome = (typeof RESOLUTION_VALIDATION_OUTCOMES)[number];

export const GRAPH_VALIDATION_STATUSES = ["SUCCEEDED", "NEEDS_REVIEW", "FAILED"] as const;
export type GraphValidationStatus = (typeof GRAPH_VALIDATION_STATUSES)[number];

export const FINDING_KINDS = ["presence", "absence"] as const;
export type FindingKind = (typeof FINDING_KINDS)[number];

export type DomainPackPin = {
  packId: string;
  packVersion: string;
  packContentSha256: string;
};

export type StudyAttemptPin = {
  studyRunId: string;
  attemptId: string;
  caseId: string;
};

export type ReasonerModelPin = {
  providerId: string;
  modelId: string;
  promptId: string;
  promptVersion: string;
  promptSha256: string;
};

export type ReaderAcceptedFactsSourceRef = {
  schemaVersion: "reader-accepted-facts/1";
  studyRunId: string;
  attemptId: string;
  promptSha256: string;
};

/** Typed observation value — same variants as canonical claims for projection adapters. */
export type ObservationValue = ClaimValue;

export type SnapshotObservation = {
  id: string;
  readerFactId: string;
  /** Pack-defined or universal predicate type id (opaque to Core). */
  predicateTypeId: string;
  value: ObservationValue;
  unit?: string;
  role: ObservationRole;
  observedOn?: string;
  effectivePeriod?: EffectivePeriod;
  evidenceRefs: EvidenceReference[];
  verificationStatus: ObservationVerificationStatus;
};

export type ObservationSnapshot = {
  schemaVersion: typeof OBSERVATION_SNAPSHOT_SCHEMA_VERSION;
  studyRunId: string;
  attemptId: string;
  caseId: string;
  domainId: string;
  packPin: DomainPackPin;
  source: ReaderAcceptedFactsSourceRef;
  createdAt: string;
  /** SHA-256 hex of canonical JSON body (excluding contentDigest when computing). */
  contentDigest: string;
  observations: SnapshotObservation[];
};

export type ProposedObservable = {
  id: string;
  typeId: string;
  label: string;
  aliases?: string[];
  externalIds?: string[];
  identityStatus: ObservableIdentityStatus;
  observationIds: string[];
  resolutionIds?: string[];
};

export type ObservationLinkProposal = {
  observationId: string;
  observableId: string;
  confidence?: "low" | "medium" | "high";
};

export type RelationshipProposal = {
  id: string;
  relationshipTypeId: string;
  fromObservableId: string;
  toObservableId: string;
  supportingObservationIds: string[];
  reasoningSummary?: string;
};

export type ResolutionProposal = {
  id: string;
  resolutionTypeId: string;
  observationIds: string[];
  observableIds: string[];
  decision: string;
  supportingObservationIds: string[];
  reasoningSummary?: string;
};

export type ConflictProposal = {
  id: string;
  observationIds: string[];
  subjectDescription?: string;
  nature: string;
  temporalScope?: EffectivePeriod;
  supportingObservationIds: string[];
};

export type AbsenceSearchScope = {
  observableTypeIds: string[];
  relationshipTypeIds: string[];
  /** Logical document ids or pack scope tokens — opaque strings supplied in context. */
  documentScopeIds: string[];
};

/** Required for absence findings before validator may accept (L3). */
export type AbsenceScopeEstablishment = {
  documentCoverageEstablished: boolean;
  searchScopeDeclared: boolean;
  searchScope: AbsenceSearchScope;
};

export type FindingProposal = {
  id: string;
  kind: FindingKind;
  description: string;
  supportingObservationIds: string[];
  supportingResolutionIds?: string[];
  /** Required when kind is absence. */
  absenceScope?: AbsenceScopeEstablishment;
};

export type UnresolvedGraphProposal = {
  id: string;
  kind: string;
  description: string;
  relatedObservationIds?: string[];
  relatedObservableIds?: string[];
};

export type CanonicalStudyReasonerProposal = {
  schemaVersion: typeof CANONICAL_STUDY_REASONER_PROPOSAL_SCHEMA_VERSION;
  studyRunId: string;
  attemptId: string;
  packPin: DomainPackPin;
  modelPin: ReasonerModelPin;
  observables: ProposedObservable[];
  observationLinks: ObservationLinkProposal[];
  relationships: RelationshipProposal[];
  resolutions: ResolutionProposal[];
  candidateConflicts: ConflictProposal[];
  candidateFindings: FindingProposal[];
  unresolved: UnresolvedGraphProposal[];
};

export type ValidatedObservable = ProposedObservable & {
  validationOutcome: ResolutionValidationOutcome;
};

export type ValidatedRelationship = RelationshipProposal & {
  validationOutcome: ResolutionValidationOutcome;
};

export type ValidatedResolution = ResolutionProposal & {
  validationOutcome: ResolutionValidationOutcome;
};

export type ValidatedConflict = ConflictProposal;

export type ValidatedFinding = FindingProposal & {
  validationOutcome: ResolutionValidationOutcome;
};

export type AcceptedCanonicalStudyGraph = {
  schemaVersion: typeof CANONICAL_STUDY_GRAPH_SCHEMA_VERSION;
  studyRunId: string;
  attemptId: string;
  caseId: string;
  domainId: string;
  packPin: DomainPackPin;
  modelPin: ReasonerModelPin;
  observationSnapshotDigest: string;
  createdAt: string;
  contentDigest: string;
  observables: ValidatedObservable[];
  /** Immutable observation copy at acceptance time (subset or full snapshot). */
  observations: SnapshotObservation[];
  relationships: ValidatedRelationship[];
  resolutions: ValidatedResolution[];
  conflicts: ValidatedConflict[];
  findings: ValidatedFinding[];
  unresolved: UnresolvedGraphProposal[];
};

export type DerivedProjectionKind =
  | "case-intelligence/3"
  | "hive.canonical-study/1"
  | "canonical-study-report/1";

export type CanonicalStudyProjectionManifest = {
  schemaVersion: typeof CANONICAL_STUDY_PROJECTION_MANIFEST_SCHEMA_VERSION;
  studyRunId: string;
  attemptId: string;
  sourceGraphDigest: string;
  projectionKind: DerivedProjectionKind;
  projectionSchemaVersion: string;
  /** Read-only derived artifact; never authoritative over hive.canonical-study-graph/1. */
  derivedAt: string;
  contentDigest: string;
  lineage: {
    graphSchemaVersion: typeof CANONICAL_STUDY_GRAPH_SCHEMA_VERSION;
    observableIds: string[];
    findingIds: string[];
  };
};
