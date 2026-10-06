import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { NestIepRecoveredPage } from "@hiveforyou/shared/intake";
import { describe, expect, it } from "vitest";

import { mapV4EvidenceRefToWordRange } from "./map-v4-evidence";

const intakeFixtures = join(dirname(fileURLToPath(import.meta.url)), "../../../intake/fixtures/l001");

describe("mapV4EvidenceRefToWordRange", () => {
  it("maps three known L001 v4 claims on 08_initial_iep", () => {
    const snap = JSON.parse(
      readFileSync(join(intakeFixtures, "document-pages/08_initial_iep.json"), "utf8"),
    );
    const pages = snap.documentPages;
    const pageModel = pages.pages.find((p: { pageNumber: number }) => p.pageNumber === 1)!;

    const recoveredPage: NestIepRecoveredPage = {
      runId: "test",
      sourceDocumentId: pages.documentId,
      pageNumber: 1,
      extractionMethod: "NATIVE",
      canonicalText: pageModel.words.map((w: { text: string }) => w.text).join(" "),
      lines: [
        { order: 4, text: "Date of Birth: 2017-04-18", startOffset: 0, endOffset: 24 },
        { order: 5, text: "Grade: 2", startOffset: 25, endOffset: 33 },
        {
          order: 28,
          text: "Goal ID: GOAL_READING_FLUENCY",
          startOffset: 34,
          endOffset: 63,
        },
      ],
      blocks: [],
      sourceIssues: [],
    };

    const claims = [
      { extractionId: "line:4", snippet: "Date of Birth: 2017-04-18" },
      { extractionId: "line:5", snippet: "Grade: 2" },
      { extractionId: "line:28", snippet: "Goal ID: GOAL_READING_FLUENCY" },
    ];

    for (const claim of claims) {
      const range = mapV4EvidenceRefToWordRange({
        documentId: pages.documentId,
        recoveredPage,
        pageModel,
        ref: {
          sourceDocumentId: "l001-src-8",
          page: 1,
          extractionId: claim.extractionId,
          snippet: claim.snippet,
        },
      });
      expect(range, claim.snippet).not.toBeNull();
      expect(range!.wordEnd).toBeGreaterThan(range!.wordStart);
    }
  });
});
