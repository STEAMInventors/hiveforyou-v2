import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";

import { extractDocument } from "../src/extract-document.ts";

const samples = [
  {
    label: "iep_prior_eligibility",
    path: "C:/Users/abhattacharyya/nestiep-corpus/cases/L002/clean/01_prior_eligibility_determination.pdf",
    mimeType: "application/pdf",
  },
  {
    label: "wells_bank_statement",
    path: process.argv[2] ?? "",
    mimeType: "application/pdf",
  },
];

function redactText(value) {
  return value
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[EMAIL]")
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN]")
    .replace(/\b\d{9,}\b/g, "[NUMBER]")
    .replace(/[A-Za-z0-9]{20,}/g, "[TOKEN]");
}

function redactNormalized(normalized) {
  if (!normalized) {
    return null;
  }
  return {
    ...normalized,
    pages: normalized.pages.map((page) => ({
      ...page,
      canonicalText: redactText(page.canonicalText).slice(0, 120) + (page.canonicalText.length > 120 ? "…" : ""),
      lines: page.lines.map((line) => ({
        ...line,
        text: redactText(line.text).slice(0, 80),
      })),
    })),
  };
}

for (const sample of samples) {
  if (!sample.path || !existsSync(sample.path)) {
    console.log(JSON.stringify({ label: sample.label, skipped: true, reason: "file missing" }, null, 2));
    continue;
  }
  const bytes = new Uint8Array(readFileSync(sample.path));
  const sourceHash = createHash("sha256").update(bytes).digest("hex");
  const result = await extractDocument(
    {
      documentId: `doc-${sample.label}`,
      bytes,
      mimeType: sample.mimeType,
      sourceHash,
    },
    { ocrEngine: null },
  );
  console.log(
    JSON.stringify(
      {
        label: sample.label,
        file: basename(sample.path),
        extractionStatus: result.extractionStatus,
        extractionMethod: result.extractionMethod,
        pageCount: result.pages.length,
        sampleChars: result.text.slice(0, 1000).length,
        normalizedExtraction: redactNormalized(result.normalizedExtraction),
      },
      null,
      2,
    ),
  );
}
