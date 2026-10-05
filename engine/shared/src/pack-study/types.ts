/** Deterministic pack-study output consumed by story skeleton + legacy narrative templates. */



export type StudyFact = {

  id: string;

  /** Raw stored value before narrative plain-wording. */

  raw: string;

  /** Customer-facing display when no plain mapping applies. */

  display: string;

  doc?: string;

  page?: number;

  date?: string;

};



export type StudyAnchorRef = {

  label: string;

  date: string;

};



export type StudyAnchors = {

  prior: StudyAnchorRef | null;

  current: StudyAnchorRef | null;

};



export type StudyGoalRow = {

  skill: string;

  baseline: StudyFact | null;

  target: StudyFact | null;

};



export type StudyReevalMeasureClause = {

  text: string;

  factIds: string[];

  direction: "higher_is_better" | "lower_is_better" | "neutral";

};



export type StudySeriesAfterPrior = {

  measureDisplay: string;

  dateDisplay: string;

  valueDisplay: string;

  goalMet: boolean | null;

  factIds: string[];

};



export type StudyMeasureSeriesPoint = {

  date: string;

  value: string;

  factId: string;

  note?: string;

  noteFactId?: string;

};



export type StudyMeasureSeries = {

  measure: string;

  unit: string;

  target?: { value: string; factId: string };

  points: StudyMeasureSeriesPoint[];

};



export type StudyRecordGap = {

  from: string;

  to: string;

  missing: string;

  factId: string;

  months?: number;

};



export type StudyAnchorComparison = {

  kind: "CHANGED" | "ADDED" | "RETIRED";

  item: string;

  prior?: string;

  current?: string;

  dropped?: string[];

  added?: string[];

  factIds: string[];

};



export type StudyTopSignal = {

  basis: string;

  factIds: string[];

};



export type StudyRowState =

  | "changed"

  | "added"

  | "dropped"

  | "reconfirmed"

  | "notcompared"

  | "scheduled";



/** Prior-vs-current row emitted by the pack study adapter (not recomputed in Pro UI). */

export type StudySlotComparison = {

  id: string;

  attributeId: string;

  sectionId: string;

  priorSlot: string | null;

  currentSlot: string | null;

  state: StudyRowState;

  note?: string;

};



export type StudyRankedSignal =

  | { kind: "comparison"; comparisonId: string }

  | { kind: "goal"; comparisonId: string; skill: string }

  | { kind: "gap"; gapIndex: number };



export type Study = {

  anchors: StudyAnchors;

  /** Flat slot paths, e.g. prior.year, student.firstName */

  facts: Record<string, StudyFact>;

  /** Legacy single-point helper for template narrative. */

  seriesAfterPrior: StudySeriesAfterPrior | null;

  /** Legacy single gap for template narrative. */

  recordGap: { months: number; startDisplay: string; endDisplay: string; factId: string } | null;

  measureSeries: StudyMeasureSeries[];

  recordGaps: StudyRecordGap[];

  anchorComparisons: StudyAnchorComparison[];

  reevalMeasures: StudyReevalMeasureClause[];

  goals: { prior: StudyGoalRow[]; current: StudyGoalRow[] };

  topSignal: StudyTopSignal | null;

  /** Guide-section-aligned prior/current rows for Pro compare table. */

  slotComparisons: StudySlotComparison[];

  /** Up to three meeting-prep signals in display order. */

  rankedSignals: StudyRankedSignal[];

};

