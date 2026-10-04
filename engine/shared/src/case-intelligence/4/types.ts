import type { ProposalLineage } from "../3/types";
import type { VoiceProposal } from "../../projections/voice";

export const CANONICAL_STUDY_PROPOSAL_SCHEMA_V4 = "canonical-study-proposal/4" as const;

export const CLAIM_MODALITIES = [
  "planned",
  "required",
  "decided",
  "observed",
  "unknown",
] as const;

export type ClaimModality = (typeof CLAIM_MODALITIES)[number];

export const MISSING_GAP_KINDS = [
  "field_present_but_empty",
  "not_found_in_supplied_documents",
] as const;

export type MissingGapKind = (typeof MISSING_GAP_KINDS)[number];

export const CONFLICT_KINDS = [
  "value_disagreement",
  "temporal_overlap",
  "status_disagreement",
  "other",
] as const;

export type ConflictKind = (typeof CONFLICT_KINDS)[number];

export type ConstructPartsProposal = {
  measure: string;
  task?: string | null;
  administration?: string | null;
};

export type ClaimValueV4 =
  | { kind: "quantity"; numberValue: number; unit?: string | null }
  | { kind: "text"; textValue: string }
  | { kind: "code"; codeValue: string }
  | { kind: "boolean"; booleanValue: boolean }
  | { kind: "entity_ref"; entityId: string }
  | { kind: "date"; dateValue: string }
  | { kind: "period"; periodStart?: string | null; periodEnd?: string | null }
  | { kind: "unknown" };

export type EvidenceReferenceV4 = {
  id: string;
  sourceDocumentId: string;
  logicalDocumentId?: string;
  page?: number;
  pageEnd?: number;
  spanStart?: number;
  spanEnd?: number;
  quote: string;
  extractionId?: string;
  sourceType: "document";
};

export type ProposedEntityV4 = {
  id: string;
  entityType: string;
  label: string;
  aliases?: string[];
  evidenceRefs: EvidenceReferenceV4[];
};

export type ProposedClaimV4 = {
  id: string;
  subjectEntityId: string;
  construct: ConstructPartsProposal;
  value: ClaimValueV4;
  unit?: string | null;
  modality: ClaimModality;
  effectivePeriod?: { start?: string; end?: string; precision?: "day" | "month" | "year" | "unknown" };
  occurredOn?: string;
  evidenceRefs: EvidenceReferenceV4[];
};

export type ProposedConflictV4 = {
  id: string;
  claimIds: string[];
  kind: ConflictKind;
};

export type ProposedMissingInformationV4 = {
  id: string;
  description: string;
  gapKind: MissingGapKind;
  subjectEntityId?: string;
  relatedConstruct?: string;
  evidenceRefs?: EvidenceReferenceV4[];
  proposalLineage: ProposalLineage;
};

export type CanonicalStudyProposalV4 = {
  schemaVersion: typeof CANONICAL_STUDY_PROPOSAL_SCHEMA_V4;
  domainId: string;
  entities: ProposedEntityV4[];
  claims: ProposedClaimV4[];
  conflicts: ProposedConflictV4[];
  missingInformation: ProposedMissingInformationV4[];
  voiceProposal?: VoiceProposal | null;
  modelMetadata: {
    providerId: string;
    modelId?: string;
    proposalMode: "fixture" | "production";
  };
  proposedAt: string;
};
