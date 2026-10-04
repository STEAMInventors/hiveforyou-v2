/**
 * case-view/2 — story, plan, prep, timeline surfaces (extends case-view/1).
 * Model text lives in clientSummary and v2 writer fields marked below.
 */

import type {
  CaseView,
  CaseItem,
  Chip,
  DisplayValue,
  ClientSummary,
  CaseDocument,
  CaseEntity,
  CaseIntent,
  CaseLayout,
  CaseAudit,
} from "./case-view";
import type { ResolvedVoice } from "./voice";
import type { StoryNarrativeV2 } from "./story-narrative-v2";
import type { PackNarrativeOutput } from "./pack-narrative";

export const CASE_VIEW_V2_SCHEMA = "case-view/2" as const;

export interface CheckQuestionItem {
  itemId: string;
  state: "worth_a_question";
  label: string;
  inFocus: boolean;
  priority: number;
  checkId: string;
  left: { label: string; value: DisplayValue; chips: Chip[] };
  right: { label: string; value: DisplayValue | null; chips: Chip[] };
  relatedItemIds: string[];
}

export type CaseItemV2 = CaseItem | CheckQuestionItem;

export type CardStatus =
  | "two_versions"
  | "worth_a_question"
  | "changed"
  | "not_in_your_documents"
  | "looks_clear"
  | "reference";

export const CARD_STATUS_PRIORITY: CardStatus[] = [
  "two_versions",
  "worth_a_question",
  "changed",
  "not_in_your_documents",
  "looks_clear",
  "reference",
];

export interface PlanCard {
  cardId: string;
  sectionId: string;
  entityId: string;
  title: string;
  status: CardStatus;
  itemIds: string[];
  oneLiner: string;
  sinceLine: string | null;
  whyLine: string | null;
  questionId: string | null;
  chips: Chip[];
}

export interface PlanSection {
  sectionId: string;
  label: string;
  cardIds: string[];
}

export type StorySlotType =
  | "echo"
  | "stayed_same"
  | "goal_progress"
  | "changed"
  | "relationship"
  | "not_found"
  | "top_question";

export interface StoryLine {
  slotId: string;
  slotType: StorySlotType;
  itemIds: string[];
  text: string;
  fallbackUsed: boolean;
  chips: Chip[];
}

export interface ChecklistEntry {
  entryId: string;
  label: string;
  status: "have" | "missing";
  logicalDocumentIds: string[];
  reason: string | null;
  reasonItemIds: string[];
  requestId: string | null;
  source: "pack_expected_document" | "period_gap" | "proposal_gap";
}

export interface PrepQuestion {
  questionId: string;
  text: string;
  fromCardId: string | null;
  fromChecklistEntryId: string | null;
  itemIds: string[];
}

export interface MeetingPrep {
  questions: PrepQuestion[];
  stayedSame: { text: string; itemIds: string[] } | null;
  bring: { label: string; logicalDocumentId: string | null; page: number | null }[];
}

export interface TimelineDate {
  value: string;
  precision: "year" | "month" | "day";
  display: string;
}

export type TimelineEventKind =
  | "document_event"
  | "period_start"
  | "period_end"
  | "coverage_gap"
  | "upcoming";

export interface TimelineEvent {
  eventId: string;
  kind: TimelineEventKind;
  date: TimelineDate | null;
  endDate: TimelineDate | null;
  title: string;
  detail: string | null;
  status: CardStatus | "gap" | null;
  itemIds: string[];
  chips: Chip[];
  requestId: string | null;
}

export interface TimelineCoverage {
  segments: { label: string; kind: "covered" | "gap" | "current"; start: string; end: string }[];
}

export interface CaseTimeline {
  coverage: TimelineCoverage;
  groups: { label: string; eventIds: string[] }[];
  events: TimelineEvent[];
}

export interface CaseHeader {
  breadcrumb: string;
  headline: string;
  /** Shown on plan/story context — not prepended to headline. */
  currentPlanLabel?: string | null;
  askedText: string;
  documentsRead: number;
  statusCounts: { worthAsking: number; changed: number; missing: number; looksClear: number };
  reference: { label: string; display: string }[];
}

export interface CaseViewV2 extends Omit<CaseView, "schemaVersion" | "items"> {
  schemaVersion: typeof CASE_VIEW_V2_SCHEMA;
  voice: ResolvedVoice;
  items: CaseItemV2[];
  header: CaseHeader;
  story: StoryLine[];
  /** Pack-template story paragraphs (when pack study is available). */
  packNarrative: PackNarrativeOutput | null;
  /** Validated skeleton→model→validator story (preferred in UI when present). */
  validatedStory?: import("./validated-story").ValidatedStoryResult | null;
  storyNarrative: StoryNarrativeV2;
  plan: { sections: PlanSection[]; cards: PlanCard[] };
  checklist: ChecklistEntry[];
  prep: MeetingPrep;
  timeline: CaseTimeline;
}

export type CaseViewV2CoreFields = Pick<
  CaseViewV2,
  "header" | "story" | "packNarrative" | "validatedStory" | "storyNarrative" | "plan" | "checklist" | "prep" | "timeline"
>;

export type CaseViewV1Base = {
  caseId: string;
  studyRunId: string;
  proposalSchema: CaseView["proposalSchema"];
  domainPack: CaseView["domainPack"];
  studiedAt: string;
  intent: CaseIntent;
  documents: CaseDocument[];
  entities: CaseEntity[];
  counts: CaseView["counts"];
  layout: CaseLayout;
  clientSummary: ClientSummary;
  audit: CaseAudit;
};
