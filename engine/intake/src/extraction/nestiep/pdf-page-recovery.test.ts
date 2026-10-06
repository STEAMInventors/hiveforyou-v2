// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { buildRecoveredPage } from "./buildRecoveredPage";
import { recoverNormalizedDocument } from "./recover-document";
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
  sourceHash: "test-hash",
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
  it("keeps wide horizontal gaps as segments on one visual line", () => {
    const page = buildRecoveredPage({
      runId: "run-gap",
      sourceDocumentId: "doc-gap",
      pageNumber: 1,
      extractionMethod: "NATIVE",
      items: [
        { text: "Score", boundingBox: { x: 72, y: 700, width: 40, height: 12 } },
        { text: "85", boundingBox: { x: 160, y: 700, width: 20, height: 12 } },
      ],
    });
    expect(page.lines).toHaveLength(1);
    expect(page.lines[0]?.text).toBe("Score 85");
    expect(page.canonicalText).toBe("Score 85");
    expect(page.lines[0]?.segments).toHaveLength(2);
  });

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

const l001CorpusDir = join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures/l001");

describe("L001 08_initial_iep recovered lines", () => {
  it("page 2 services header is one line with five segments", async () => {
    const fileName = "08_initial_iep.pdf";
    const bytes = readFileSync(join(l001CorpusDir, fileName));
    const sourceHash = createHash("sha256").update(bytes).digest("hex");
    const normalized = await recoverNormalizedDocument({
      sourceDocumentId: fileName,
      sourceHash,
      bytes,
      mimeType: "application/pdf",
      ocrEngine: undefined,
    });
    const page = normalized.pages[1];
    const headers = ["Service", "Frequency", "Minutes", "Location", "Start Date"];
    const headerLine = page!.lines.find((line) =>
      headers.every((label) => line.text.includes(label)),
    );
    expect(headerLine, "services header should be one recovered line").toBeDefined();
    expect(headerLine!.segments?.length ?? 0).toBe(5);
  });

  it("page 2 services data row includes 150 minutes in a segment", async () => {
    const fileName = "08_initial_iep.pdf";
    const bytes = readFileSync(join(l001CorpusDir, fileName));
    const sourceHash = createHash("sha256").update(bytes).digest("hex");
    const normalized = await recoverNormalizedDocument({
      sourceDocumentId: fileName,
      sourceHash,
      bytes,
      mimeType: "application/pdf",
      ocrEngine: undefined,
    });
    const page = normalized.pages[1];
    const dataLine = page!.lines.find(
      (line) => line.text.includes("150") && line.text.toLowerCase().includes("minute"),
    );
    expect(dataLine).toBeDefined();
    expect(
      dataLine!.segments?.some((segment) => /150\s*minutes/i.test(segment.text)),
    ).toBe(true);
  });
});
