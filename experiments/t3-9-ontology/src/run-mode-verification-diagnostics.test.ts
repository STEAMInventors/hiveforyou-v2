import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { findConsecutiveWordQuote } from "@hiveforyou/core/document/find-consecutive-word-quote";
import { describe, expect, it } from "vitest";

import { loadL001ExperimentCorpus } from "./corpus.js";
import { readerWireFactToCandidateFact } from "../../../engine/eval/src/reader-experiment/fact-match.js";
import {
  serializeVerificationDiagnostics,
  verifyWithDiagnosticsReport,
  writeVerificationDiagnosticsJson,
} from "./run-mode.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("run-mode verification diagnostics", () => {
  it("accepts valid quotes, rejects invalid quotes, and persists diagnostics JSON", async () => {
    const { bundles } = await loadL001ExperimentCorpus(repoRoot);
    const iep = bundles.find((b) => b.filename === "08_initial_iep.pdf");
    expect(iep).toBeDefined();

    const page = iep!.documentPages.pages.find((p) => p.pageNumber === 1);
    expect(page).toBeDefined();
    const words = [...page!.words].sort((a, b) => a.seq - b.seq);
    let validQuote = "";
    for (let start = 0; start < Math.min(words.length, 40); start += 1) {
      for (let len = 3; len <= 8; len += 1) {
        const candidate = words
          .slice(start, start + len)
          .map((w) => w.text)
          .join(" ");
        if (findConsecutiveWordQuote(page!.words, candidate)) {
          validQuote = candidate;
          break;
        }
      }
      if (validQuote) {
        break;
      }
    }
    expect(validQuote.length).toBeGreaterThan(0);

    const valid = readerWireFactToCandidateFact({
      id: "persist-valid",
      construct: { measure: "iep.document_label", task: null, administration: null },
      value: { kind: "text", textValue: "Initial IEP" },
      modality: "observed",
      evidenceRefs: [
        {
          id: "ev-valid",
          sourceDocumentId: iep!.sourceDocumentId,
          sourceType: "document",
          page: 1,
          quote: validQuote,
        },
      ],
    })!;
    const invalid = {
      ...valid,
      id: "persist-invalid",
      evidenceRefs: [
        {
          ...valid.evidenceRefs[0]!,
          id: "ev-invalid",
          quote: "THIS QUOTE DOES NOT EXIST ON PAGE ONE",
        },
      ],
    };

    const validRun = await verifyWithDiagnosticsReport(bundles, [valid], 2, 1);
    const invalidRun = await verifyWithDiagnosticsReport(bundles, [invalid], 1, 0);

    expect(validRun.accepted).toHaveLength(1);
    expect(validRun.rejected).toBe(0);
    expect(validRun.report.acceptedCount).toBe(1);
    expect(validRun.report.rejected).toHaveLength(0);

    expect(invalidRun.accepted).toHaveLength(0);
    expect(invalidRun.rejected).toBe(1);
    expect(invalidRun.report.rejected[0]?.sourceDocumentId).toBe(iep!.sourceDocumentId);
    expect(invalidRun.report.rejected[0]?.page).toBe(1);
    expect(invalidRun.report.rejected[0]?.quotePreview).toBeTruthy();
    expect(invalidRun.report.rejected[0]?.reasons.some((r) => r.includes("Quote does not match"))).toBe(true);
    expect(invalidRun.report.rejectionCategoryCounts.QUOTE_NO_MATCH).toBe(1);

    const tmp = mkdtempSync(join(tmpdir(), "t39-diag-"));
    try {
      writeVerificationDiagnosticsJson(tmp, "A", { report: validRun.report });
      const persisted = JSON.parse(readFileSync(join(tmp, "verification-diagnostics.json"), "utf8"));
      expect(persisted.schemaVersion).toBe("t3-9-ontology/verification-diagnostics/1");
      expect(persisted.acceptedCount).toBe(1);
      expect(JSON.stringify(persisted)).not.toMatch(/api[_-]?key|ANTHROPIC|OPENAI/i);

      const modeC = serializeVerificationDiagnostics("C", {
        atomic: validRun.report,
        relationship: invalidRun.report,
      });
      expect(modeC).toMatchObject({ mode: "C", atomic: { acceptedCount: 1 }, relationship: { rejectedCount: 1 } });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
