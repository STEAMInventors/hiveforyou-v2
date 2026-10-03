import { describe, expect, it } from "vitest";

import type { NestIepRecoveredPage } from "@hiveforyou/shared/intake";

import { locateSnippetInPage } from "./locate-snippet-in-page";

function page(text: string): NestIepRecoveredPage {
  return {
    runId: "run",
    sourceDocumentId: "src",
    pageNumber: 2,
    extractionMethod: "NATIVE",
    canonicalText: text,
    lines: [
      {
        text,
        startOffset: 0,
        endOffset: text.length,
        order: 0,
        boundingBox: { x: 12, y: 400, width: 300, height: 14 },
      },
    ],
    blocks: [{ startOffset: 0, endOffset: text.length, lineIndexes: [0] }],
    sourceIssues: [],
  };
}

describe("locateSnippetInPage", () => {
  it("finds exact substring", () => {
    const result = locateSnippetInPage(
      page("Extended time (1.5x) on classroom assessments."),
      "Extended time (1.5x)",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.matchedText).toBe("Extended time (1.5x)");
      expect(result.region).toMatchObject({ y: 400 });
    }
  });

  it("matches across whitespace differences", () => {
    const result = locateSnippetInPage(
      page("Text-to-speech is available for grade-level instructional text."),
      "Text-to-speech  is available",
    );
    expect(result.ok).toBe(true);
  });
});
