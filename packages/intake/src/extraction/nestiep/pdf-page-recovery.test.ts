import { describe, expect, it } from "vitest";

import { buildRecoveredPage } from "./buildRecoveredPage";
import {
  evaluatePdfPageQuality,
  recoverPdfDocumentPages,
  type PdfRecoveryContext,
} from "./pdfHandler";

const ops = {
  paintImageXObject: 90,
  paintImageXObjectRepeat: 91,
  paintInlineImageXObject: 92,
};

const context: PdfRecoveryContext = {
  runId: "run-1",
  stepId: "intake-extract",
  sourceDocumentId: "doc-1",
};

describe("recoverPdfDocumentPages", () => {
  it("isolates a page whose getTextContent throws and continues", async () => {
    const document = {
      numPages: 2,
      async getPage(pageNumber: number) {
        if (pageNumber === 1) {
          return {
            getTextContent: async () => {
              throw new Error("content stream missing");
            },
            getOperatorList: async () => ({ fnArray: [] }),
            getViewport: () => ({ width: 612, height: 792 }),
            cleanup: async () => {},
            render: () => ({ promise: Promise.resolve() }),
          };
        }
        return {
          getTextContent: async () => ({
            items: [
              {
                str: "Page two still recovers.",
                transform: [1, 0, 0, 1, 72, 700],
                width: 120,
                height: 12,
                hasEOL: false,
              },
            ],
          }),
          getOperatorList: async () => ({ fnArray: [] }),
          getViewport: () => ({ width: 612, height: 792 }),
          cleanup: async () => {},
          render: () => ({ promise: Promise.resolve() }),
        };
      },
      async destroy() {},
    };

    const pages = await recoverPdfDocumentPages(document, ops, context);
    expect(pages).toHaveLength(2);
    expect(pages[0]?.sourceIssues.map((issue) => issue.code)).toEqual([
      "CORRUPTED_PAGE",
      "EMPTY_PAGE",
    ]);
    expect(pages[0]?.sourceIssues.filter((issue) => issue.code === "CORRUPTED_PAGE")).toHaveLength(1);
    expect(pages[1]?.canonicalText).toBe("Page two still recovers.");
  });
});

describe("buildRecoveredPage", () => {
  it("does not add an issue code the page already has", () => {
    const page = buildRecoveredPage({
      runId: "run-1",
      sourceDocumentId: "doc-1",
      pageNumber: 1,
      extractionMethod: "NATIVE",
      items: [],
      sourceIssues: [
        { code: "EMPTY_PAGE", message: "Already recorded.", pageNumber: 1 },
      ],
    });
    expect(page.sourceIssues.filter((issue) => issue.code === "EMPTY_PAGE")).toHaveLength(1);
  });
});

describe("evaluatePdfPageQuality", () => {
  it("matches the full and fast operator-list paths", async () => {
    const text = `${"Word ".repeat(40)}0123456789`;
    let operatorCalls = 0;
    const page = {
      getTextContent: async () => ({
        items: [
          {
            str: text,
            transform: [1, 0, 0, 1, 72, 700],
            width: 400,
            height: 12,
            hasEOL: false,
          },
        ],
      }),
      getOperatorList: async () => {
        operatorCalls += 1;
        return { fnArray: [ops.paintImageXObject, ops.paintImageXObject] };
      },
      getViewport: () => ({ width: 612, height: 792 }),
      cleanup: async () => {},
      render: () => ({ promise: Promise.resolve() }),
    };

    const { full, fast } = await evaluatePdfPageQuality(page, ops);
    expect(operatorCalls).toBe(1);
    expect(full.operatorListSkipped).toBe(false);
    expect(fast.operatorListSkipped).toBe(true);
    expect(full.decision.useOcr).toBe(fast.decision.useOcr);
    expect(full.decision.reasons).toEqual(fast.decision.reasons);
    expect(full.decision.metrics.imageOperatorCount).toBe(2);
    expect(fast.decision.metrics.imageOperatorCount).toBeNull();
  });
});
