import { describe, expect, it } from "vitest";

import { applyFieldSynonymNormalization, parseFieldSynonyms } from "./pack-driven-reader/field-synonyms.js";
import { normalizeComparableFieldText } from "./comparable-normalization.js";
import type { ProposalDomainPack } from "./pack-driven-reader/types.js";

describe("comparable-normalization", () => {
  it("scopes field synonyms to the declared field path", () => {
    const entries = parseFieldSynonyms([
      { field: "goal.area", terms: ["Reading Fluency", "reading fluency"], value: "reading fluency" },
      { field: "measure.score_type", terms: ["WCPM"], value: "words_correct_per_minute" },
    ]);
    expect(applyFieldSynonymNormalization("WCPM", entries, "goal.area")).toBe("wcpm");
    expect(applyFieldSynonymNormalization("WCPM", entries, "measure.score_type")).toBe(
      "words_correct_per_minute",
    );
  });

  it("normalizes comparable text with pack vocabulary", () => {
    const pack = {
      schemaVersion: "hive.domain-pack.proposal/0.3.0",
      manifest: { id: "synthetic", version: "0.0.1" },
      documentTypes: [],
      recordTypes: [],
      readingNotes: { global: "", byDocumentType: {} },
      vocabulary: {
        fieldSynonyms: [
          { field: "goal.area", terms: ["Reading Fluency"], value: "reading fluency" },
        ],
      },
    } satisfies ProposalDomainPack;
    expect(
      normalizeComparableFieldText({
        pack,
        recordTypeId: "goal",
        fieldId: "area",
        text: "Reading Fluency",
      }),
    ).toBe("reading fluency");
  });
});
