export const CANONICAL_STUDY_PROPOSAL_SCHEMA = "canonical-study-proposal/2" as const;

/** @deprecated Use `/2` — retained for migration references only. */
export const CANONICAL_STUDY_PROPOSAL_SCHEMA_V1 = "canonical-study-proposal/1" as const;

export type ClaimTemporalKind =
  | "current"
  | "historical"
  | "planned"
  | "proposed"
  | "superseded"
  | "continued"
  | "unknown";

export type EvidenceReference = {
  id: string;
  /** Required for document-backed facts when logical documents exist on study context. */
  logicalDocumentId?: string;
  sourceDocumentId: string;
  page?: number;
  pageEnd?: number;
  spanStart?: number;
  spanEnd?: number;
  sourceType: "document";
  snippet?: string;
  extractionId?: string;
};

export type ProposedEntity = {
  id: string;
  entityType: string;
  label: string;
  sourceDocumentIds?: string[];
};

export type ProposedMeasurement = {
  value: number | string;
  unit?: string;
  asOf?: string;
};

export type ProposedClaim = {
  id: string;
  claimType: string;
  subjectEntityId?: string;
  statement: string;
  /** When true, at least one document evidence ref is required. */
  isFactual: boolean;
  temporalKind?: ClaimTemporalKind;
  measurement?: ProposedMeasurement;
  evidenceRefs: EvidenceReference[];
  /** Emphasis metadata — not evidence. */
  objectiveRelevance?: { relatedObjectiveEcho?: string };
};

export type ProposedRelationship = {
  id: string;
  relationshipType: string;
  fromEntityId: string;
  toEntityId: string;
  crossDomain?: boolean;
  evidenceRefs?: EvidenceReference[];
};

export type ProposedEvent = {
  id: string;
  eventType: string;
  label: string;
  occurredOn?: string;
  entityIds?: string[];
  evidenceRefs?: EvidenceReference[];
};

export type ProposedConflict = {
  id: string;
  claimIds: string[];
  description: string;
  severity: "informational" | "material";
};

export type ProposedMissingness = {
  id: string;
  description: string;
  relatedDocumentIds?: string[];
};

export type ProposedDerivedClaimCandidate = {
  id: string;
  derivedClaimType: string;
  statement: string;
  basisClaimIds: string[];
  evidenceRefs: EvidenceReference[];
};

export type CanonicalStudyProposalV2 = {
  schemaVersion: typeof CANONICAL_STUDY_PROPOSAL_SCHEMA;
  domainId: string;
  entities: ProposedEntity[];
  claims: ProposedClaim[];
  relationships: ProposedRelationship[];
  events: ProposedEvent[];
  conflicts: ProposedConflict[];
  missingness: ProposedMissingness[];
  derivedClaimCandidates: ProposedDerivedClaimCandidate[];
  warnings: string[];
  sourceReferences: EvidenceReference[];
  modelMetadata: {
    providerId: string;
    modelId?: string;
    proposalMode: "fixture" | "production";
  };
  proposedAt: string;
};

/** @deprecated Use CanonicalStudyProposalV2 */
export type CanonicalStudyProposalV1 = CanonicalStudyProposalV2;
