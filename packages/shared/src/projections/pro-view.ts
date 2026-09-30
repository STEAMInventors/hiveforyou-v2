import type {
  EvidenceReference,
  ProposedClaim,
  ProposedConflict,
  ProposedEntity,
  ProposedEvent,
  ProposedMissingness,
  ProposedRelationship,
} from "../canonical-study/proposal";

export type ProViewClaimEvidence = EvidenceReference & { claimId: string };

export const PRO_VIEW_SCHEMA = "pro-view/1" as const;

export type ProView = {
  schemaVersion: typeof PRO_VIEW_SCHEMA;
  caseId: string;
  intelligenceVersion: number;
  domainIds: string[];
  entities: ProposedEntity[];
  claims: ProposedClaim[];
  claimEvidence: ProViewClaimEvidence[];
  relationships: ProposedRelationship[];
  crossDomainRelationships?: ProposedRelationship[];
  events: ProposedEvent[];
  conflicts: ProposedConflict[];
  missingness: ProposedMissingness[];
};
