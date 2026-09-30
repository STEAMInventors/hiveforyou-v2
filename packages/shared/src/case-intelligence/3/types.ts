import type { StudySourceDocumentRef } from "../../canonical-study/source-document";

import type { CanonicalStudyValidationResultV3 } from "./validation-result";



/**

 * Case-intelligence/3 and canonical-study-proposal/3 contracts.

 * Not used by the running study path. Runtime snapshots stay on case-intelligence/2.

 */



export const CANONICAL_STUDY_PROPOSAL_SCHEMA_V3 = "canonical-study-proposal/3" as const;



export const CASE_INTELLIGENCE_SCHEMA_V3 = "case-intelligence/3" as const;



export const CLAIM_ROLES = [

  "planned",

  "required",

  "decided",

  "observed",

  "current",

  "historical",

  "superseded",

  "unknown",

] as const;



export type ClaimRole = (typeof CLAIM_ROLES)[number];



export const CONFLICT_KINDS = [

  "value_disagreement",

  "temporal_overlap",

  "status_disagreement",

  "other",

] as const;



export type ConflictKind = (typeof CONFLICT_KINDS)[number];



export const UNRESOLVED_ITEM_KINDS = [

  "missing_document",

  "missing_information",

  "conflict_open",

] as const;



export type UnresolvedItemKind = (typeof UNRESOLVED_ITEM_KINDS)[number];



export const UNRESOLVED_SOURCES = [

  "engine1_completeness",

  "model_proposal",

  "validation",

  "conflict",

] as const;



export type UnresolvedSource = (typeof UNRESOLVED_SOURCES)[number];



export type ClaimValue =

  | { kind: "quantity"; amount: number }

  | { kind: "text"; text: string }

  | { kind: "code"; code: string }

  | { kind: "boolean"; value: boolean }

  | { kind: "entity_ref"; entityId: string }

  | { kind: "date"; value: string }

  | { kind: "period"; start?: string; end?: string }

  | { kind: "unknown" };



/**

 * Source location only. Model and study lineage live on ProposalLineage.

 * Same fields as the running evidence reference.

 */

export type EvidenceReference = {

  id: string;

  sourceDocumentId: string;

  /** Required when the study context has logical documents. Enforced by provenance validation, not this type. */

  logicalDocumentId?: string;

  page?: number;

  pageEnd?: number;

  spanStart?: number;

  spanEnd?: number;

  snippet?: string;

  /** Source-side extraction locator, when the chip points at an extracted span. */

  extractionId?: string;

  sourceType: "document";

};



/** How a model proposal item led to a snapshot item. Not an evidence locator. */

export type ProposalLineage = {

  proposalItemId: string;

  studyRunId: string;

};



export type EffectivePeriod = {

  start?: string;

  end?: string;

  precision?: "day" | "month" | "year" | "unknown";

};



export type ProposedEntity = {

  id: string;

  entityType: string;

  label: string;

  evidenceRefs: EvidenceReference[];

};



export type ProposedClaim = {

  id: string;

  subjectEntityId: string;

  construct: string;

  value: ClaimValue;

  unit?: string;

  role: ClaimRole;

  effectivePeriod?: EffectivePeriod;

  occurredOn?: string;

  evidenceRefs: EvidenceReference[];

};



export type ProposedConflict = {

  id: string;

  /** Two or more proposal claim ids. */

  claimIds: string[];

  kind: ConflictKind;

};



/**

 * Model-proposed gap or ambiguity from Canonical Study.

 * Not a validated factual claim. The description states what is missing or unclear;

 * it must not be treated as canonical fact in projections.

 *

 * Provenance: evidenceRefs are optional when the absence itself has no direct chip.

 * When present, each ref supports why the item is unresolved (chip law applies to those refs).

 * Factual assertions belong in proposed claims with chips—not as asserted fact in this row alone.

 */

export type ProposedMissingInformation = {

  id: string;

  description: string;

  subjectEntityId?: string;

  relatedConstruct?: string;

  evidenceRefs?: EvidenceReference[];

  proposalLineage: ProposalLineage;

};



export type CanonicalStudyProposal = {

  schemaVersion: typeof CANONICAL_STUDY_PROPOSAL_SCHEMA_V3;

  domainId: string;

  entities: ProposedEntity[];

  claims: ProposedClaim[];

  conflicts: ProposedConflict[];

  missingInformation: ProposedMissingInformation[];

  modelMetadata: {

    providerId: string;

    modelId?: string;

    proposalMode: "fixture" | "production";

  };

  proposedAt: string;

};



/** A proposed claim that passed schema, referential, provenance, and value-shape checks. */

export type ValidatedClaim = {

  id: string;

  domainId: string;

  subjectEntityId: string;

  /** Opaque model-discovered id; novelty is not a validation failure. */

  construct: string;

  value: ClaimValue;

  unit?: string;

  role: ClaimRole;

  effectivePeriod?: EffectivePeriod;

  occurredOn?: string;

  evidenceRefs: EvidenceReference[];

  proposalLineage: ProposalLineage;

};



/**

 * Timeline index over one validated claim that has a usable time anchor (`occurredOn` or `effectivePeriod`).

 * Built by code from accepted claims; not an independent factual atom or hardcoded event type.

 */

export type CanonicalEvent = {

  id: string;

  claimId: string;

  construct: string;

  subjectEntityId: string;

  occurredOn?: string;

  effectivePeriod?: EffectivePeriod;

  evidenceRefs: EvidenceReference[];

  timelineOrderHint?: number;

};



export type Conflict = {

  id: string;

  /** Two or more validated claim ids. */

  claimIds: string[];

  kind: ConflictKind;

  subjectEntityId?: string;

  construct?: string;

};



export type UnresolvedItem = {

  id: string;

  kind: UnresolvedItemKind;

  source: UnresolvedSource;

  /** Human-readable gap description. Required for missing_information. */

  description?: string;

  subjectEntityId?: string;

  relatedConstruct?: string;

  relatedClaimIds?: string[];

  /** Engine 1 structure-map expectations not satisfied. */

  relatedLogicalDocumentIds?: string[];

  /** Why the gap is inferred; optional when the absence has no direct chip. */

  evidenceRefs?: EvidenceReference[];

  /** Links back to the model proposal item when source is model_proposal. */

  proposalLineage?: ProposalLineage;

};



export type CanonicalCaseSnapshot = {

  schemaVersion: typeof CASE_INTELLIGENCE_SCHEMA_V3;

  version: number;

  caseId: string;

  studyRunId: string;

  createdAt: string;

  caseScope: "single_domain" | "multi_domain";

  domainId: string;

  /**

   * Discover/study pack lineage for audit and routing only.

   * Does not authorize constructs, constrain values/units/roles, or act as semantic validation input.

   */

  domainPackId: string;

  /** Same as domainPackId: audit/routing lineage only—not a construct gate. */

  domainPackVersion: string;

  domainSlices?: Array<{

    domainId: string;

    studyRunId: string;

    domainPackId: string;

    domainPackVersion: string;

  }>;

  entities: ProposedEntity[];

  claims: ValidatedClaim[];

  events: CanonicalEvent[];

  conflicts: Conflict[];

  changes: Array<{

    id: string;

    subjectEntityId: string;

    construct: string;

    fromClaimId: string;

    toClaimId: string;

  }>;

  unresolved: UnresolvedItem[];

  /** Frozen study inputs for provenance resolution in projections and UI. */
  sourceDocuments: StudySourceDocumentRef[];

  validationResult: CanonicalStudyValidationResultV3;

};


