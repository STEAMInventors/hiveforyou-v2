import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { extractDocument } from "../extract-document";

const IEP_PDF =
  "C:/Users/abhattacharyya/nestiep-corpus/cases/L002/clean/01_prior_eligibility_determination.pdf";

const REFERRAL_PDF =
  "C:/Users/abhattacharyya/nestiep-corpus/cases/L001/clean/01_initial_referral.pdf";

const BANK_CANDIDATES = [
  process.env.HIVE_REGRESSION_BANK_PDF ?? "",
  "C:/Users/abhattacharyya/nestiep-corpus/cases/L001/clean/wells_fargo_statement.pdf",
  "C:/Users/abhattacharyya/Downloads/wells_fargo_statement.pdf",
].filter(Boolean);

function redactText(value: string): string {
  return value
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[EMAIL]")
    .replace(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, "[NAME]")
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN]")
    .replace(/\b\d{9,}\b/g, "[NUMBER]")
    .replace(/[A-Za-z0-9]{20,}/g, "[TOKEN]");
}

function redactNormalized(result: Awaited<ReturnType<typeof extractDocument>>) {
  const normalized = result.normalizedExtraction;
  if (!normalized) {
    return null;
  }
  return {
    schemaVersion: normalized.schemaVersion,
    sourceDocumentId: normalized.sourceDocumentId,
    sourceHash: normalized.sourceHash,
    mimeType: normalized.mimeType,
    detectedKind: normalized.detectedKind,
    statistics: normalized.statistics,
    sourceIssues: normalized.sourceIssues,
    pages: normalized.pages.map((page) => ({
      pageNumber: page.pageNumber,
      extractionMethod: page.extractionMethod,
      canonicalTextPreview: redactText(page.canonicalText).slice(0, 120),
      lineCount: page.lines.length,
      blockCount: page.blocks.length,
      sampleLine: page.lines[0]
        ? {
            ...page.lines[0],
            text: redactText(page.lines[0].text).slice(0, 80),
          }
        : null,
      qualityDecision: page.qualityDecision ?? null,
      sourceIssues: page.sourceIssues,
    })),
  };
}

async function reportFile(label: string, path: string) {
  const bytes = new Uint8Array(readFileSync(path));
  const sourceHash = createHash("sha256").update(bytes).digest("hex");
  const result = await extractDocument(
    {
      documentId: `regression-${label}`,
      bytes,
      mimeType: "application/pdf",
      sourceHash,
    },
    { ocrEngine: null },
  );
  // eslint-disable-next-line no-console -- regression artifact for agents/operators
  console.log(
    JSON.stringify(
      {
        label,
        extractionStatus: result.extractionStatus,
        extractionMethod: result.extractionMethod,
        jevSampleLength: result.text.slice(0, 1000).length,
        normalizedExtraction: redactNormalized(result),
      },
      null,
      2,
    ),
  );
  return result;
}

describe("regression extraction reports (redacted)", () => {
  it("prints normalized extraction structure for IEP corpus PDF", async () => {
    if (!existsSync(IEP_PDF)) {
      return;
    }
    const result = await reportFile("iep_prior_eligibility", IEP_PDF);
    expect(result.extractionStatus).toBe("SUCCEEDED");
    expect(result.normalizedExtraction?.pages.length).toBeGreaterThan(0);
  });

  it("extracts L001 initial referral PDF when corpus is present", async () => {
    if (!existsSync(REFERRAL_PDF)) {
      return;
    }
    const result = await reportFile("initial_referral", REFERRAL_PDF);
    expect(["SUCCEEDED", "NEEDS_OCR"]).toContain(result.extractionStatus);
  });

  it("prints normalized extraction structure for Wells Fargo statement when available", async () => {
    const bankPath = BANK_CANDIDATES.find((candidate) => existsSync(candidate));
    if (!bankPath) {
      // eslint-disable-next-line no-console -- regression artifact for agents/operators
      console.log(JSON.stringify({ label: "wells_bank_statement", skipped: true }, null, 2));
      return;
    }
    const result = await reportFile("wells_bank_statement", bankPath);
    expect(result.extractionStatus).toBe("SUCCEEDED");
  });
});
