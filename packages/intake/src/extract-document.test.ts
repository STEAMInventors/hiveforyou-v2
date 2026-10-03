import { describe, expect, it, vi } from "vitest";

import {
  NORMALIZED_EXTRACTION_SCHEMA_VERSION,
  type NormalizedDocumentExtraction,
  type NestIepRecoveredPage,
} from "@hiveforyou/shared/intake";

import { assessExtraction, extractDocument, NATIVE_EXTRACTION_METHOD } from "./extract-document";
import { buildNormalizedDocumentExtraction } from "./extraction/nestiep/recover-document";

const enough = "Account activity for the statement period with deposits and withdrawals listed in full. ";

function mockPage(overrides: Partial<NestIepRecoveredPage> & Pick<NestIepRecoveredPage, "pageNumber" | "canonicalText">): NestIepRecoveredPage {
  return {
    runId: "run-1",
    sourceDocumentId: "doc-1",
    extractionMethod: "NATIVE",
    lines: [],
    blocks: [],
    sourceIssues: [],
    ...overrides,
  };
}

function mockNormalized(pages: NestIepRecoveredPage[]): NormalizedDocumentExtraction {
  return buildNormalizedDocumentExtraction({
    sourceDocumentId: "doc-1",
    sourceHash: "hash-1",
    mimeType: "application/pdf",
    detectedKind: "pdf",
    documentIssues: [],
    pages,
  });
}

describe("extractDocument", () => {
  it("treats short native text as needing OCR", async () => {
    const normalized = mockNormalized([mockPage({ pageNumber: 1, canonicalText: "   " })]);
    const result = await extractDocument(
      {
        documentId: "doc-1",
        bytes: new TextEncoder().encode("%PDF-"),
        mimeType: "application/pdf",
        sourceHash: "abc",
      },
      { ocrEngine: null, recover: async () => normalized },
    );
    expect(result.extractionStatus).toBe("NEEDS_OCR");
    expect(result.pages).toHaveLength(1);
    expect(result.extractionMethod).toBe(NATIVE_EXTRACTION_METHOD);
  });

  it("keeps page boundaries when native text is sufficient", async () => {
    const normalized = mockNormalized([
      mockPage({ pageNumber: 1, canonicalText: enough }),
      mockPage({ pageNumber: 2, canonicalText: enough }),
    ]);
    const result = await extractDocument(
      {
        documentId: "doc-1",
        bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]),
        mimeType: "application/pdf",
        sourceHash: "hash-1",
      },
      { ocrEngine: null, recover: async () => normalized },
    );
    expect(result.extractionStatus).toBe("SUCCEEDED");
    expect(result.pages.map((page) => page.pageNumber)).toEqual([1, 2]);
    expect(result.text).toContain("\n\n");
    expect(result.sourceHash).toBe("hash-1");
    expect(result.normalizedExtraction?.schemaVersion).toBe(NORMALIZED_EXTRACTION_SCHEMA_VERSION);
  });

  it("does not classify an image as extracted text when OCR is unavailable", async () => {
    const recover = vi.fn(async () =>
      mockNormalized([
        mockPage({
          pageNumber: 1,
          canonicalText: "",
          extractionMethod: "OCR",
          sourceIssues: [{ code: "OCR_FAILED", message: "no engine", pageNumber: 1 }],
        }),
      ]),
    );
    const result = await extractDocument(
      {
        documentId: "doc-img",
        bytes: new Uint8Array([0xff, 0xd8, 0xff]),
        mimeType: "image/jpeg",
        sourceHash: "img",
      },
      { ocrEngine: null, recover },
    );
    expect(result.extractionStatus).toBe("NEEDS_OCR");
    expect(recover).toHaveBeenCalledOnce();
  });

  it("returns FAILED when recovery throws", async () => {
    const result = await extractDocument(
      {
        documentId: "doc-1",
        bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]),
        mimeType: "application/pdf",
        sourceHash: "hash-1",
      },
      {
        ocrEngine: null,
        recover: async () => {
          throw new Error("parse boom");
        },
      },
    );
    expect(result.extractionStatus).toBe("FAILED");
    expect(result.errorCode).toBe("EXTRACTION_FAILED");
    expect(result.pages).toEqual([]);
  });

  it("reads plain text as a single page", async () => {
    const result = await extractDocument({
      documentId: "doc-txt",
      bytes: new TextEncoder().encode(enough.repeat(2)),
      mimeType: "text/plain",
      sourceHash: "txt",
    }, { ocrEngine: null });
    expect(result.extractionStatus).toBe("SUCCEEDED");
    expect(result.extractionMethod).toBe("plain-text");
    expect(result.pages).toEqual([
      expect.objectContaining({ pageNumber: 1, boundingBoxes: null }),
    ]);
  });
});

describe("assessExtraction", () => {
  it("preserves a later bounding box without changing page identity fields", () => {
    const normalized = mockNormalized([
      mockPage({
        pageNumber: 2,
        canonicalText: enough.repeat(2),
        lines: [
          {
            text: enough.repeat(2),
            startOffset: 0,
            endOffset: enough.repeat(2).length,
            order: 0,
            boundingBox: { x: 1, y: 2, width: 3, height: 4 },
          },
        ],
      }),
    ]);
    const result = assessExtraction({
      documentId: "doc-1",
      sourceHash: "hash-1",
      extractionMethod: NATIVE_EXTRACTION_METHOD,
      pages: [
        {
          pageNumber: 2,
          text: enough.repeat(2),
          boundingBoxes: [{ x: 1, y: 2, width: 3, height: 4 }],
        },
      ],
      normalizedExtraction: normalized,
    });
    expect(result.pages[0]).toMatchObject({
      pageNumber: 2,
      boundingBoxes: [{ x: 1, y: 2, width: 3, height: 4 }],
    });
  });
});
