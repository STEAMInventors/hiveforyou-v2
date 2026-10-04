import type { DiscoverQuestionAnswerKind, DiscoverQuestionOption } from "./discovery-question";

import type {

  DiscoverDomainResolutionStatus,

  DiscoverRecognitionStatus,

  DiscoverRelationshipKind,

  ProposedDiscoverRelationship,

  ProposedDomainResolution,

  ProposedLogicalDocument,

} from "./proposal";



export const HIVE_DISCOVER_PROPOSAL_SCHEMA_V2 = "hive-discover-proposal/2" as const;



export type DiscoverAmbiguityKind =

  | "DOCUMENT_IDENTITY"

  | "RELATIONSHIP"

  | "DOMAIN"

  | "CHRONOLOGY"

  | "CASE_ENTITY";



export type ProposedAmbiguityCandidate = {

  id: string;

  kind: DiscoverAmbiguityKind;

  summary: string;

  relatedLogicalDocumentIds: string[];

  /** Model-estimated materiality — code decides whether to ask. */

  affectsStructure: boolean;

};



/** Minimum customer clarification questions proposed in discovery Call #1. */

export type ProposedClarificationQuestion = {

  id: string;

  prompt: string;

  humanReason: string;

  answerKind: Extract<DiscoverQuestionAnswerKind, "single_choice" | "multi_select">;

  options: DiscoverQuestionOption[];

  ambiguityCandidateId: string;

  relatedLogicalDocumentIds: string[];

};



/** Pack category grouping derived from logical document groupIds (not model domainGroups). */

export type ProposedDocumentCategory = {

  id: string;

  logicalDocumentIds: string[];

  description: string;

};



/** One resolved domain route — exactly one entry per unique domainId in model proposals. */

export type ProposedDomainGroup = {

  id: string;

  domainId: string;

  domainLabel: string;

  logicalDocumentIds: string[];

  description: string;

  /** Model proposals for this domain only. Pack does not author these. */

  suggestedObjectives: ProposedSuggestedObjective[];

  suggestedAudiences: ProposedSuggestedAudience[];

  /** Enriched after validation from logicalDocuments.groupId; not model-authored. */

  documentCategories?: ProposedDocumentCategory[];

};



/** Distinct trimmed domain ids, in first-seen order. */

export function uniqueDomainIds(groups: Array<{ domainId: string }>): string[] {

  const seen = new Set<string>();

  const ids: string[] = [];

  for (const group of groups) {

    const domainId = group.domainId.trim();

    if (!domainId || seen.has(domainId)) {

      continue;

    }

    seen.add(domainId);

    ids.push(domainId);

  }

  return ids;

}



export type ProposedSuggestedObjective = {

  id: string;

  label: string;

  summary: string;

};



export type ProposedSuggestedAudience = {

  id: string;

  label: string;

  roleHint: string;

};



export type HiveDiscoverProposalV2 = {

  schemaVersion: typeof HIVE_DISCOVER_PROPOSAL_SCHEMA_V2;

  domainResolution: ProposedDomainResolution;

  /** Domain routing only — one group per unique domainId. */

  domainGroups: ProposedDomainGroup[];

  logicalDocuments: ProposedLogicalDocument[];

  relationships: ProposedDiscoverRelationship[];

  ambiguityCandidates: ProposedAmbiguityCandidate[];

  clarificationQuestions: ProposedClarificationQuestion[];

};



/** Customer-facing collection understanding from Call #1 (model proposals). */

export type DiscoverCollectionUnderstanding = {

  domainResolutionStatus: DiscoverDomainResolutionStatus;

  domainGroups: ProposedDomainGroup[];

  unresolvedAmbiguitySummary: string | null;

};



export type HiveDiscoverProposalAny =

  | import("./proposal").HiveDiscoverProposalV1

  | HiveDiscoverProposalV2;



export function isDiscoverProposalV2(raw: unknown): raw is HiveDiscoverProposalV2 {

  if (typeof raw !== "object" || raw === null) {

    return false;

  }

  const candidate = raw as HiveDiscoverProposalV2;

  if (candidate.schemaVersion !== HIVE_DISCOVER_PROPOSAL_SCHEMA_V2) {

    return false;

  }

  return Array.isArray(candidate.domainGroups);

}



export type {

  DiscoverDomainResolutionStatus,

  DiscoverRecognitionStatus,

  DiscoverRelationshipKind,

  ProposedLogicalDocument,

  ProposedDiscoverRelationship,

  ProposedDomainResolution,

};

