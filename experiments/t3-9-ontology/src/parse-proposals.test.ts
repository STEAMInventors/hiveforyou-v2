import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadInitialIepFactCatalog } from "./load-catalog.js";
import { loadL001ExperimentCorpus } from "./corpus.js";
import { createLocalReaderVerifier } from "./local-verifier.js";
import { parseExtractionResponse } from "./parse-proposals.js";
import { gradeReaderFactsAgainstGolden } from "../../../engine/eval/src/reader-experiment/fact-match.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function quoteFromWordRange(
  page: { words: Array<{ seq: number; text: string }> },
  range: [number, number],
): string {
  const words = [...page.words].sort((a, b) => a.seq - b.seq);
  return words.slice(range[0], range[1]).map((w) => w.text).join(" ");
}

describe("parseExtractionResponse contract", () => {
  it("round-trips prompt-shaped JSON through verifier and golden grader without data loss", async () => {
    const catalog = loadInitialIepFactCatalog();
    const { golden, gradeCorpus, bundles } = await loadL001ExperimentCorpus(repoRoot);
    const goldenDate = golden.facts.find((f) => f.id === "clm_iep_date");
    expect(goldenDate).toBeDefined();

    const iepBundle = bundles.find((b) => b.filename === "08_initial_iep.pdf");
    expect(iepBundle?.sourceDocumentId).toBe("l001-src-8");

    const page = iepBundle!.documentPages.pages.find((p) => p.pageNumber === goldenDate!.pageNumber);
    expect(page).toBeDefined();

    const quote = quoteFromWordRange(page!, goldenDate!.wordRange);
    expect(quote.length).toBeGreaterThan(0);

    const outputText = JSON.stringify({
      proposals: [
        {
          id: "round-trip-clm_iep_date",
          catalogTypeId: "clm_iep_date",
          construct: { measure: "iep.meeting_date", task: null, administration: null },
          value: { kind: "date", dateValue: "2024-11-12" },
          modality: "observed",
          evidence: [{ sourceDocumentId: iepBundle!.sourceDocumentId, page: goldenDate!.pageNumber, quote }],
        },
      ],
    });

    const parsed = parseExtractionResponse(outputText, catalog);
    expect(parsed.dropped).toBe(0);
    expect(parsed.candidates).toHaveLength(1);

    const candidate = parsed.candidates[0]!;
    const verifier = createLocalReaderVerifier(bundles);
    expect((await verifier.verifyCandidate(candidate)).accepted).toBe(true);

    const metrics = gradeReaderFactsAgainstGolden({ golden, candidates: [candidate], corpus: gradeCorpus });
    expect(metrics.matchedCount).toBeGreaterThanOrEqual(1);
  });

  it("drops proposals that omit catalogTypeId or use non-quote evidence fields", () => {
    const catalog = loadInitialIepFactCatalog();
    const parsed = parseExtractionResponse(
      JSON.stringify({
        proposals: [
          {
            id: "legacy-1",
            typeId: "clm_iep_date",
            construct: { measure: "iep.meeting_date", task: null, administration: null },
            value: { kind: "date", dateValue: "2024-11-12" },
            modality: "observed",
            evidence: [{ sourceDocumentId: "l001-src-8", page: 1, snippet: "Nov 12 2024" }],
          },
        ],
      }),
      catalog,
    );
    expect(parsed.candidates).toHaveLength(0);
    expect(parsed.dropped).toBe(1);
  });
});
