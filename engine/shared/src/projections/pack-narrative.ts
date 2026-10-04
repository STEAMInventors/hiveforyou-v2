export type PackNarrativeChapter = "then" | "since" | "now" | "next" | "ask";

export type PackNarrativeSentence = {
  templateId: string;
  text: string;
  factIds: string[];
};

export type PackNarrativeOutput = {
  opening: string;
  paragraphs: { chapter: PackNarrativeChapter; sentences: PackNarrativeSentence[] }[];
  skipped: { templateId: string; missingSlots: string[] }[];
};
