export type ProChip = { label: string; docId: string; page?: number; factId?: string };

export type ProCell =
  | { values: { text: string; chip: ProChip }[] }
  | { empty: "not-in-document" | "not-captured" | "not-applicable" };

export type ProRowState =
  | "changed"
  | "added"
  | "dropped"
  | "reconfirmed"
  | "not-compared"
  | "scheduled";

export type ProRow = {
  id: string;
  label: string;
  prior: ProCell;
  current: ProCell;
  state: ProRowState;
  note?: string;
};

export type ProGroup = { sectionId: string; title: string; rows: ProRow[] };

export type ProSignal = {
  rank: number;
  state: ProRowState | "gap";
  title: string;
  detail: string;
  chips: ProChip[];
  question: string | null;
};

export type ProHeader = {
  title: string;
  facts: { label: string; text: string }[];
  documentCount: number;
  recordSpan: string;
};

export type ProMeasurePoint = {
  dateLabel: string;
  valueText: string;
  chip: ProChip;
};

export type ProMeasureSeriesView = {
  id: string;
  title: string;
  unit: string | null;
  goalTarget: string | null;
  goalChip: ProChip | null;
  points: ProMeasurePoint[];
  pointChips: ProChip[];
  warning: string | null;
};

export type ProDetailRow = {
  id: string;
  label: string;
  valueText: string;
  chip: ProChip;
};

export type ProTimelineGap = {
  months: number;
  fromLabel: string;
  toLabel: string;
};

export type ProTimelineEntry = {
  docId: string;
  title: string;
  date: string | null;
  undated: boolean;
  factCount: number;
  chip: ProChip;
  gapBefore: ProTimelineGap | null;
};

export type ProCoverageRow = {
  docId: string;
  title: string;
  chip: ProChip;
  pages: number[];
  factCount: number;
  status: "ok" | "undated" | "empty" | "partial";
  statusLabel: string;
};

export type ProLedgerRow = {
  factId: string;
  dateLabel: string;
  label: string;
  valueText: string;
  quote: string;
  chip: ProChip;
};

export type ProViewModel = {
  header: ProHeader;
  signals: ProSignal[];
  groups: ProGroup[];
  measureSeries: ProMeasureSeriesView[];
  reevalRows: ProDetailRow[];
  timeline: ProTimelineEntry[];
  coverage: ProCoverageRow[];
  ledger: ProLedgerRow[];
};
