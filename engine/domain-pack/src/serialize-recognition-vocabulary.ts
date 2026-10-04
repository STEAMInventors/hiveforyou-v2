import type { DomainPackVocabularyTerm } from "./types";

/** Compact JSON-safe rows for Engine 2 user messages (recognition only). */
export type RecognitionVocabularyPromptRow = {
  termId: string;
  label: string;
  category: string;
  abbreviations?: string[];
  aliases?: string[];
  contextRequired?: boolean;
  jurisdiction?: string;
  regulation?: string;
};

export function serializeRecognitionVocabularyForPrompt(
  terms: readonly DomainPackVocabularyTerm[],
): RecognitionVocabularyPromptRow[] {
  return terms.map((term) => {
    const row: RecognitionVocabularyPromptRow = {
      termId: term.termId,
      label: term.label,
      category: term.category,
    };
    if (term.abbreviations?.length) {
      row.abbreviations = [...term.abbreviations];
    }
    if (term.aliases?.length) {
      row.aliases = [...term.aliases];
    }
    if (term.contextRequired) {
      row.contextRequired = true;
    }
    if (term.jurisdiction?.trim()) {
      row.jurisdiction = term.jurisdiction.trim();
    }
    if (term.regulation?.trim()) {
      row.regulation = term.regulation.trim();
    }
    return row;
  });
}
