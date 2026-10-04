/**
 * case-view/1 — code-owned presentation snapshot for Pro, client summary, and export.
 * Model text belongs only in `clientSummary` (selected items).
 */

export const CASE_VIEW_SCHEMA = "case-view/1" as const;

export type Modality = "planned" | "required" | "decided" | "observed" | "unknown";

export type EvidenceState =
  | "conflicting"
  | "unclear_identity"
  | "changed"
  | "empty_field"
  | "not_found"
  | "established";

/** Verified chip — only refs that passed location check appear in caseView. */
export type Chip = {
  evidenceId: string;
  sourceDocumentId: string;
  logicalDocumentId: string | null;
  fileName: string;
  page: number;
  extractionId: string | null;
  quote: string;
};

export type ConstructParts = {
  measure: string;
  task: string | null;
  administration: string | null;
  key: string;
};

export type DisplayValue = {
  kind: "quantity" | "text" | "code" | "boolean" | "entity_ref" | "date" | "period" | "unknown";
  display: string;
  numberValue: number | null;
  unit: string | null;
  textValue: string | null;
  codeValue: string | null;
  booleanValue: boolean | null;
  entityId: string | null;
  dateValue: string | null;
  periodStart: string | null;
  periodEnd: string | null;
};

type ItemBase = {
  itemId: string;
  state: EvidenceState;
  label: string;
  inFocus: boolean;
  priority: number;
};

export type ConflictSide = {
  claimId: string;
  value: DisplayValue;
  modality: Modality;
  occurredOn: string | null;
  chips: Chip[];
};

export type ConflictItem = ItemBase & {
  state: "conflicting";
  conflictKind: "value_disagreement" | "temporal_overlap" | "status_disagreement" | "other";
  construct: ConstructParts;
  subjectEntityId: string;
  sides: ConflictSide[];
  proNote: string | null;
};

export type IdentityCandidate = {
  entityId: string;
  displayName: string;
  chips: Chip[];
};

export type IdentityItem = ItemBase & {
  state: "unclear_identity";
  candidates: IdentityCandidate[];
  proDecision: null | "same" | "separate";
};

export type SeriesPoint = {
  claimId: string;
  anchorDate: string;
  value: DisplayValue;
  modality: Modality;
  chips: Chip[];
};

export type ChangeItem = ItemBase & {
  state: "changed";
  construct: ConstructParts;
  subjectEntityId: string;
  series: SeriesPoint[];
};

export type DocumentRequest = {
  requestId: string;
  documentType: string;
  label: string;
  status: "open" | "requested" | "received";
};

export type EmptyFieldItem = ItemBase & {
  state: "empty_field";
  description: string;
  chips: Chip[];
  relatedItemIds: string[];
};

export type NotFoundItem = ItemBase & {
  state: "not_found";
  description: string;
  source: "proposal_gap" | "pack_expected_fact";
  request: DocumentRequest;
  relatedItemIds: string[];
};

export type FactItem = ItemBase & {
  state: "established";
  claimId: string;
  subjectEntityId: string;
  construct: ConstructParts;
  value: DisplayValue;
  modality: Modality;
  occurredOn: string | null;
  effectivePeriod: { start: string | null; end: string | null } | null;
  chips: Chip[];
};

export type CaseItem =
  | ConflictItem
  | IdentityItem
  | ChangeItem
  | EmptyFieldItem
  | NotFoundItem
  | FactItem;

export type CaseIntent = {
  intentId: string | null;
  label: string;
  clientText: string | null;
  focusConstructs: string[];
};

export type CaseDocument = {
  logicalDocumentId: string;
  sourceDocumentId: string;
  fileName: string;
  documentType: string;
  documentDate: string | null;
  pageStart: number;
  pageEnd: number;
  readStatus: "read" | "partially_read" | "unreadable";
};

export type CaseEntity = {
  entityId: string;
  displayName: string;
  entityType: string;
  aliases: string[];
};

export type FactGroup = {
  groupId: string;
  label: string;
  entityId: string | null;
  itemIds: string[];
};

export type CaseLayout = {
  needsDecision: { inFocus: string[]; outOfFocus: string[] };
  changed: string[];
  gaps: string[];
  facts: FactGroup[];
};

export type ClientSummaryItem = {
  summaryItemId: string;
  sourceItemId: string;
  stateLabel: string;
  text: string;
  worthAsking: string;
  chips: Chip[];
};

export type ClientQuestion = {
  questionId: string;
  text: string;
  sourceSummaryItemId: string;
};

export type ClientNote = {
  noteId: string;
  sourceItemId: string;
  text: string;
  chips: Chip[];
};

export type ClientSummary = {
  selectionRule: string;
  items: ClientSummaryItem[];
  emptyStateText: string | null;
  notes: ClientNote[];
  requests: DocumentRequest[];
  questions: ClientQuestion[];
  writtenBy: { model: string; promptVersion: string } | null;
};

export type CaseAudit = {
  proposed: number;
  accepted: number;
  rejected: number;
  rejectionReasons: { reason: string; count: number }[];
  rejectedProposalIds: string[];
};

export type CaseView = {
  schemaVersion: typeof CASE_VIEW_SCHEMA;
  caseId: string;
  studyRunId: string;
  proposalSchema:
    | "canonical-study-proposal/4"
    | "canonical-study-proposal/3"
    | "canonical-study-proposal/5";
  domainPack: { packId: string; version: string } | null;
  studiedAt: string;
  intent: CaseIntent;
  documents: CaseDocument[];
  entities: CaseEntity[];
  counts: {
    needsDecision: number;
    changed: number;
    gaps: number;
    established: number;
    rejected: number;
  };
  items: CaseItem[];
  layout: CaseLayout;
  clientSummary: ClientSummary;
  audit: CaseAudit;
};

export function buildConstructKey(parts: {
  measure: string;
  task: string | null;
  administration: string | null;
}): string {
  const task = parts.task?.trim() || "-";
  const administration = parts.administration?.trim() || "-";
  return `${parts.measure.trim()}|${task}|${administration}`;
}

/** Maps v3 single-string construct ids (or pipe keys) into case-view parts. */
export function constructPartsFromCanonicalConstruct(construct: string): ConstructParts {
  const trimmed = construct.trim();
  const segments = trimmed.split("|");
  if (segments.length >= 3) {
    const measure = segments[0] ?? trimmed;
    const task = segments[1] === "-" ? null : (segments[1] ?? null);
    const administration = segments[2] === "-" ? null : (segments[2] ?? null);
    return {
      measure,
      task,
      administration,
      key: buildConstructKey({ measure, task, administration }),
    };
  }
  return {
    measure: trimmed,
    task: null,
    administration: null,
    key: buildConstructKey({ measure: trimmed, task: null, administration: null }),
  };
}
