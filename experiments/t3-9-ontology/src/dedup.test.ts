import { describe, expect, it } from "vitest";

import { conservativeDeduplicateCandidateFacts } from "./dedup.js";

describe("conservativeDeduplicateCandidateFacts", () => {
  it("merges only identical atomic claims", () => {
    const fact = {
      id: "a1",
      construct: { measure: "iep.date", task: null, administration: null },
      value: { kind: "date" as const, dateValue: "2024-11-12" },
      modality: "observed" as const,
      evidenceRefs: [
        {
          id: "ev1",
          sourceDocumentId: "l001-src-8",
          sourceType: "document" as const,
          page: 1,
          snippet: "2024-11-12",
        },
      ],
    };
    const otherQuote = {
      ...fact,
      id: "a2",
      evidenceRefs: [{ ...fact.evidenceRefs[0]!, snippet: "2024-11-13" }],
    };
    const dup = { ...fact, id: "a3" };

    const merged = conservativeDeduplicateCandidateFacts([fact, otherQuote, dup]);
    expect(merged.stats.preMergeCount).toBe(3);
    expect(merged.stats.postMergeCount).toBe(2);
    expect(merged.stats.removedCount).toBe(1);
  });
});
