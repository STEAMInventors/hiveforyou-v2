import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { assembleDocument } from "../document/assembly";
import { extractTier0Structural } from "./structural";
import { validateQuote } from "./validate";

const intakeFixtures = join(dirname(fileURLToPath(import.meta.url)), "../../../intake/fixtures/l001");

describe("validateQuote checkbox tier-0", () => {
  it("anchors [X] Eligible for special education for v4 claim-eligible overlap", () => {
    const snap = JSON.parse(
      readFileSync(join(intakeFixtures, "document-pages/07_eligibility_determination.json"), "utf8"),
    );
    const pages = snap.documentPages;
    const assembled = assembleDocument(pages);
    const tier0 = extractTier0Structural({ pages, assembled, issuedDate: null });
    const eligible = tier0.statements.find((s) => s.attributeRaw === "Eligible for special education");
    expect(eligible?.force).toBe("selects");
    const quote = eligible!.evidence[0]!.quote;
    const { evidence, reason } = validateQuote(assembled, pages, quote);
    expect(reason).toBeNull();
    expect(evidence.length).toBe(1);
    expect(evidence[0]!.wordRange[0]).toBeLessThanOrEqual(173);
    expect(evidence[0]!.wordRange[1]).toBeGreaterThanOrEqual(178);
  });
});

describe("validateQuote multiline", () => {
  it("matches a quote spanning consecutive line blocks in the same section", () => {
    const snap = JSON.parse(
      readFileSync(join(intakeFixtures, "document-pages/05_academic_evaluation.json"), "utf8"),
    );
    const pages = snap.documentPages;
    const assembled = assembleDocument(pages);
    const prose = assembled.blocks.filter(
      (b) =>
        b.kind === "line" &&
        b.text.includes("Connected-text reading is slow and effortful"),
    );
    expect(prose.length).toBeGreaterThan(0);
    const anchor = prose[0]!;
    const next = assembled.blocks.find(
      (b) =>
        b.kind === "line" &&
        b.parentBlockId === anchor.parentBlockId &&
        b.seq === anchor.seq + 1 &&
        b.text.includes("connected-text reading"),
    );
    expect(next).toBeDefined();
    const quote =
      "Connected-text reading is slow and effortful. Frequent pauses were observed. Isolated word reading is stronger than connected-text reading.";
    const { evidence, reason } = validateQuote(assembled, pages, quote);
    expect(reason).toBeNull();
    expect(evidence.length).toBeGreaterThanOrEqual(2);
    expect(new Set(evidence.map((e) => e.blockId)).size).toBeGreaterThanOrEqual(2);
  });
});
