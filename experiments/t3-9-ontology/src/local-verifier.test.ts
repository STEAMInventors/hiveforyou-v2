import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { findConsecutiveWordQuote } from "@hiveforyou/core/document/find-consecutive-word-quote";
import { describe, expect, it } from "vitest";

import { loadL001ExperimentCorpus } from "./corpus.js";
import { createLocalReaderVerifier } from "./local-verifier.js";
import { readerWireFactToCandidateFact } from "../../../engine/eval/src/reader-experiment/fact-match.js";
import {
  buildVerificationDiagnosticsReport,
  categorizeVerifierReason,
} from "./verification-diagnostics.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("local reader verifier (L001)", () => {
  it("accepts a verbatim page quote and rejects a fabricated quote", async () => {
    const { bundles } = await loadL001ExperimentCorpus(repoRoot);
    const iep = bundles.find((b) => b.filename === "08_initial_iep.pdf");
    expect(iep?.sourceDocumentId).toBe("l001-src-8");

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

    const wireValid = {
      id: "diag-valid",
      construct: { measure: "iep.document_label", task: null, administration: null },
      value: { kind: "text" as const, textValue: "Initial IEP" },
      modality: "observed" as const,
      evidenceRefs: [
        {
          id: "ev-valid",
          sourceDocumentId: iep!.sourceDocumentId,
          sourceType: "document" as const,
          page: 1,
          quote: validQuote,
        },
      ],
    };
    const wireInvalid = {
      ...wireValid,
      id: "diag-invalid",
      evidenceRefs: [
        {
          ...wireValid.evidenceRefs[0]!,
          id: "ev-invalid",
          quote: "THIS QUOTE DOES NOT EXIST ON PAGE ONE",
        },
      ],
    };

    const validCandidate = readerWireFactToCandidateFact(wireValid);
    const invalidCandidate = readerWireFactToCandidateFact(wireInvalid);
    expect(validCandidate?.evidenceRefs[0]?.quote).toBe(validQuote);

    const verifier = createLocalReaderVerifier(bundles);
    const validResult = await verifier.verifyCandidate(validCandidate!);
    const invalidResult = await verifier.verifyCandidate(invalidCandidate!);

    expect(validResult.accepted).toBe(true);
    expect(validResult.reasons).toEqual([]);

    expect(invalidResult.accepted).toBe(false);
    expect(invalidResult.reasons.some((r) => r.includes("Quote does not match"))).toBe(true);
    expect(categorizeVerifierReason(invalidResult.reasons[0]!)).toBe("QUOTE_NO_MATCH");
  });

  it("maps readerWireFact quote field into verifier evidence (not silent empty)", async () => {
    const { bundles } = await loadL001ExperimentCorpus(repoRoot);
    const candidate = readerWireFactToCandidateFact({
      id: "quote-only-wire",
      construct: { measure: "iep.document_label", task: null, administration: null },
      value: { kind: "text", textValue: "x" },
      modality: "observed",
      evidenceRefs: [
        {
          id: "ev1",
          sourceDocumentId: "l001-src-8",
          sourceType: "document",
          page: 1,
          quote: "NOT A REAL QUOTE FOR DIAGNOSTICS",
        },
      ],
    });
    expect(candidate).not.toBeNull();

    const verifier = createLocalReaderVerifier(bundles);
    const result = await verifier.verifyCandidate(candidate!);
    expect(result.reasons[0]).not.toBe("At least one evidence reference is required.");
    expect(result.reasons.some((r) => r.includes("Quote does not match"))).toBe(true);
  });

  it("reports parse vs candidate counts in diagnostics", async () => {
    const { bundles } = await loadL001ExperimentCorpus(repoRoot);
    const verifier = createLocalReaderVerifier(bundles);
    const candidate = readerWireFactToCandidateFact({
      id: "c1",
      construct: { measure: "m", task: null, administration: null },
      value: { kind: "text", textValue: "t" },
      modality: "observed",
      evidenceRefs: [
        {
          id: "ev",
          sourceDocumentId: "08_initial_iep.pdf",
          sourceType: "document",
          page: 1,
          quote: "Initial Individualized Education Program",
        },
      ],
    })!;

    const verified = [
      await verifier.verifyCandidate(candidate),
    ];
    const report = buildVerificationDiagnosticsReport({
      proposals: [{ id: "p1" }, { id: "p2" }],
      candidates: [candidate],
      parseDropped: 1,
      verified,
    });

    expect(report.proposalCount).toBe(2);
    expect(report.candidateCount).toBe(1);
    expect(report.parseDropped).toBe(1);
    expect(report.rejected[0]?.categories.some((c) => c === "DOCUMENT_IDENTITY" || c === "SCOPE_OR_PROVENANCE")).toBe(
      true,
    );
  });
});
