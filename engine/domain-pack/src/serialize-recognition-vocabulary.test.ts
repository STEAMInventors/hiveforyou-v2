import { describe, expect, it } from "vitest";

import { serializeRecognitionVocabularyForPrompt } from "./serialize-recognition-vocabulary";
import type { DomainPackVocabularyTerm } from "./types";

describe("serializeRecognitionVocabularyForPrompt", () => {
  it("omits empty optional fields", () => {
    const terms: DomainPackVocabularyTerm[] = [
      {
        termId: "iep",
        label: "Individualized Education Program",
        category: "plan",
        abbreviations: ["IEP"],
      },
    ];
    expect(serializeRecognitionVocabularyForPrompt(terms)).toEqual([
      {
        termId: "iep",
        label: "Individualized Education Program",
        category: "plan",
        abbreviations: ["IEP"],
      },
    ]);
  });

  it("includes contextRequired and regulation when set", () => {
    const terms: DomainPackVocabularyTerm[] = [
      {
        termId: "ot",
        label: "Occupational therapy",
        category: "service",
        abbreviations: ["OT"],
        contextRequired: true,
      },
    ];
    expect(serializeRecognitionVocabularyForPrompt(terms)[0]?.contextRequired).toBe(true);
  });
});
