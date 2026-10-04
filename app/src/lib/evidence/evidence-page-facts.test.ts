import { describe, expect, it } from "vitest";

import type { ResolvedEvidenceRef } from "@hiveforyou/shared/projections";

import {
  citationNumbersForPage,
  compareMarkerNumberStarts,
  orderedRegionalRefs,
} from "./evidence-page-facts";

function ref(id: string, lineOrder: number, y: number): ResolvedEvidenceRef {
  return {
    id,
    sourceType: "document",
    lineOrder,
    region: { x: 0, y, width: 100, height: 10, coordinateSpace: "source-document-page" },
  };
}

describe("evidence-page-facts citation numbering", () => {
  it("numbers only regional refs in reading order starting at markerNumberStart", () => {
    const refs = [
      ref("a", 1, 0.1),
      { id: "b", sourceType: "document" as const },
      ref("c", 2, 0.2),
    ];
    expect(orderedRegionalRefs(refs).map((r) => r.id)).toEqual(["a", "c"]);
    const numbers = citationNumbersForPage(refs, 1);
    expect(numbers.get("a")).toBe(1);
    expect(numbers.get("c")).toBe(2);
    expect(numbers.has("b")).toBe(false);
  });

  it("assigns compare pane starts: right 1..n, left n+1..", () => {
    expect(compareMarkerNumberStarts(2, [4, 2])).toEqual([3, 1]);
  });
});
