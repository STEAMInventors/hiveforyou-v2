import type { ClaimRole } from "../case-intelligence/3/types";

export const CASE_MAP_SCHEMA = "case-map/1" as const;

export const CASE_MAP_NODE_KINDS = [
  "root",
  "zone",
  "construct",
  "fact",
  "ghost",
  "decision",
  "change",
] as const;

export type CaseMapNodeKind = (typeof CASE_MAP_NODE_KINDS)[number];

export const CASE_MAP_ATTENTION_KINDS = [
  "conflict",
  "evidence_gap",
  "unresolved",
] as const;

export type CaseMapAttentionKind = (typeof CASE_MAP_ATTENTION_KINDS)[number];

export type CaseMapDisclosureLevel = "prominent" | "normal" | "quiet" | "collapsed";

export type CaseMapNode = {
  id: string;
  kind: CaseMapNodeKind;
  label: string;
  /** Validated claim ids this node represents or summarizes. */
  claimIds?: string[];
  /** Preserved canonical claim role for fact/decision nodes. */
  claimRole?: ClaimRole;
  subjectEntityId?: string;
  construct?: string;
  zoneId?: string;
  unresolvedId?: string;
  conflictId?: string;
  changeId?: string;
  fromClaimId?: string;
  toClaimId?: string;
  /** Short display line derived at projection time; not a second truth store. */
  summary?: string;
  disclosureLevel?: CaseMapDisclosureLevel;
  parentId?: string;
  /** Stable depth hint for progressive disclosure (0 = root). */
  depth?: number;
  /** Pack or builder metadata for UI hints only. */
  display?: Record<string, string>;
};

export type CaseMapEdge = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  kind: "contains" | "relates";
};

export type CaseMapAttention = {
  id: string;
  kind: CaseMapAttentionKind;
  label: string;
  nodeId?: string;
  conflictId?: string;
  unresolvedId?: string;
  claimIds?: string[];
};

export type CaseMapChronologyEntry = {
  id: string;
  eventId: string;
  claimId: string;
  subjectEntityId: string;
  construct: string;
  occurredOn?: string;
  datePrecision?: "day" | "month" | "year" | "unknown";
  timelineOrderHint?: number;
  label: string;
};

export type CaseMap = {
  schemaVersion: typeof CASE_MAP_SCHEMA;
  caseId: string;
  studyRunId: string;
  intelligenceVersion: number;
  domainId: string;
  domainPackId: string;
  domainPackVersion: string;
  projectionVersion: 1;
  rootNodeId: string;
  nodes: CaseMapNode[];
  edges: CaseMapEdge[];
  attention: CaseMapAttention[];
  chronology: CaseMapChronologyEntry[];
};
