import type { PackNarrativeChapter } from "@hiveforyou/shared/projections";

export type StorySkeleton = {
  intent: string;
  subject: string;
  anchors: { prior?: AnchorRef; current?: AnchorRef };
  chapters: SkeletonChapter[];
  facts: Record<string, SkeletonFact>;
};

export type AnchorRef = { label: string; date: string };

export type SkeletonFact = {
  label: string;
  value: string;
  unit?: string;
  date?: string;
  doc: string;
  page?: number;
};

export type SkeletonChapter =
  | { chapter: "then"; factIds: string[] }
  | { chapter: "since"; series: SkeletonSeries[]; gaps: SkeletonGap[] }
  | { chapter: "now"; factIds: string[] }
  | { chapter: "next"; diffs: SkeletonDiff[] }
  | { chapter: "ask"; basis: string; factIds: string[] };

export type SkeletonSeries = {
  measure: string;
  unit: string;
  target?: { value: string; factId: string };
  points: {
    date: string;
    value: string;
    factId: string;
    note?: string;
    noteFactId?: string;
  }[];
};

export type SkeletonGap = {
  from: string;
  to: string;
  missing: string;
  factId: string;
};

export type SkeletonDiff = {
  item: string;
  prior?: string;
  current?: string;
  dropped?: string[];
  added?: string[];
  factIds: string[];
};

export const STORY_CHAPTER_ORDER: PackNarrativeChapter[] = ["then", "since", "now", "next", "ask"];
