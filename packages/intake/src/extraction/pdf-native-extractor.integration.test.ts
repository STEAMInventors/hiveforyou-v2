import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { NORMALIZED_EXTRACTION_SCHEMA_VERSION } from "@hiveforyou/shared/intake";

import { extractDocument, NATIVE_EXTRACTION_METHOD } from "../extract-document";

const corpusPdf =
  "C:/Users/abhattacharyya/nestiep-corpus/cases/L002/clean/01_prior_eligibility_determination.pdf";

describe("nestiep extraction integration", () => {
  it("extracts native text from L002 prior eligibility PDF when corpus is present", async () => {
    if (!existsSync(corpusPdf)) {
      return;
    }
    const bytes = new Uint8Array(readFileSync(corpusPdf));
    const result = await extractDocument(
      {
        documentId: "doc-iep",
        bytes,
        mimeType: "application/pdf",
        sourceHash: "integration-hash",
      },
      { ocrEngine: null },
    );
    expect(result.extractionStatus).toBe("SUCCEEDED");
    expect(result.extractionMethod).toBe(NATIVE_EXTRACTION_METHOD);
    expect(result.pages.length).toBeGreaterThan(0);
    expect(result.pages.every((page) => page.extractionMethod === "NATIVE")).toBe(true);
    expect(result.normalizedExtraction?.schemaVersion).toBe(NORMALIZED_EXTRACTION_SCHEMA_VERSION);
    expect(result.normalizedExtraction?.pages.length).toBe(result.pages.length);
    expect(result.normalizedExtraction?.pages.some((page) => page.lines.length > 0)).toBe(true);
  });
});
