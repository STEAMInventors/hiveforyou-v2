import type { PackNarrativeChapter } from "./pack-narrative";

export const VALIDATED_STORY_SCHEMA = "story-prose/1" as const;

export type ValidatedStorySentence = {
  text: string;
  factIds: string[];
};

export type ValidatedStoryParagraph = {
  chapter: PackNarrativeChapter;
  sentences: ValidatedStorySentence[];
};

export type ValidatedStoryProse = {
  schemaVersion: typeof VALIDATED_STORY_SCHEMA;
  paragraphs: ValidatedStoryParagraph[];
};

export type ValidatedStoryFallbackLine = {
  label: string;
  value: string;
  unit?: string;
  factIds: string[];
};

export type ValidatedStoryResult =
  | { kind: "prose"; story: ValidatedStoryProse }
  | { kind: "fallback"; lines: ValidatedStoryFallbackLine[]; errors: string[] };
