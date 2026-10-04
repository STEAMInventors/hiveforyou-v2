import { loadPdfJsWithOps } from "../pdfjs-worker";
import type { RecoveredPage, SourceIssue } from "./contracts";
import { buildRecoveredPage } from "./buildRecoveredPage";
import {
  canSkipOperatorList,
  computePageQualityMetrics,
  countMeaningfulCharacters,
  decideNativeVsOcr,
  isGarbageOcrReasons,
  type QualityThresholds,
} from "./qualityGate";
import { joinPdfNativeItems, type PdfNativeTextItem } from "./pdf-text-items";
import type { PageRasterizer } from "./rasterize-types";
import type { OcrEngine } from "./ocrEngine";
import { PdfOpenError } from "./pdf-open-error";

export { PdfOpenError } from "./pdf-open-error";

export interface PdfRecoveryContext {
  readonly runId: string;
  readonly stepId: string;
  readonly sourceDocumentId: string;
  readonly ocrEngine?: OcrEngine;
  readonly qualityThresholds?: QualityThresholds;
  readonly rasterizer?: PageRasterizer;
  readonly resolvePageRasterizer?: () => Promise<PageRasterizer>;
}

type PdfDocumentProxy = {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageProxy>;
  destroy(): Promise<void>;
};

type PdfPageProxy = {
  getTextContent(): Promise<{ items: readonly unknown[] }>;
  getOperatorList(): Promise<{ fnArray: readonly number[] }>;
  getViewport(params: { scale: number }): { width: number; height: number };
  render(params: {
    canvasContext: unknown;
    canvas: unknown;
    viewport: { width: number; height: number };
  }): { promise: Promise<void> };
  cleanup(): Promise<void>;
};

export type PdfPageQualityEvaluation = {
  readonly decision: ReturnType<typeof decideNativeVsOcr>;
  readonly operatorListSkipped: boolean;
};

/** Runs full and fast operator-list paths; used by tests (P1). */
export async function evaluatePdfPageQuality(
  page: PdfPageProxy,
  ops: PdfOps,
  thresholds?: QualityThresholds,
): Promise<{ full: PdfPageQualityEvaluation; fast: PdfPageQualityEvaluation }> {
  const nativeItems = await extractNativeItems(page);
  const full = await qualityDecisionForPage(page, ops, nativeItems, thresholds, false);
  const fast = await qualityDecisionForPage(page, ops, nativeItems, thresholds, true);
  return { full, fast };
}

export async function recoverPdfDocumentPages(
  document: PdfDocumentProxy,
  ops: PdfOps,
  context: PdfRecoveryContext,
): Promise<RecoveredPage[]> {
  const pages: RecoveredPage[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    try {
      pages.push(await recoverOnePdfPage(document, pageNumber, ops, context));
    } catch {
      pages.push(
        buildRecoveredPage({
          runId: context.runId,
          sourceDocumentId: context.sourceDocumentId,
          pageNumber,
          extractionMethod: "NATIVE",
          items: [],
          sourceIssues: [
            {
              code: "CORRUPTED_PAGE",
              message: "Page text could not be recovered.",
              pageNumber,
            },
          ],
        }),
      );
    }
  }
  return pages;
}

export async function recoverPdfPages(
  bytes: Uint8Array,
  context: PdfRecoveryContext,
): Promise<RecoveredPage[]> {
  const loaded = await loadPdf(bytes);
  try {
    return await recoverPdfDocumentPages(loaded.document, loaded.ops, context);
  } finally {
    try {
      await loaded.document.destroy();
    } catch {
      // Best-effort cleanup.
    }
    try {
      await loaded.loadingTask.destroy();
    } catch {
      // Best-effort worker shutdown.
    }
  }
}

async function loadPdf(
  bytes: Uint8Array,
): Promise<{
  document: PdfDocumentProxy;
  loadingTask: { destroy(): Promise<void> };
  ops: PdfOps;
}> {
  const { getDocument, OPS } = await loadPdfJsWithOps();
  const data = new Uint8Array(bytes.byteLength);
  data.set(bytes);
  const loadingTask = getDocument({
    data,
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: true,
    useWasm: false,
    verbosity: 0,
  }) as { promise: Promise<PdfDocumentProxy>; destroy(): Promise<void> };
  try {
    const document = await loadingTask.promise;
    return { document, loadingTask, ops: OPS };
  } catch (error) {
    try {
      await loadingTask.destroy();
    } catch {
      // Ignore worker shutdown after a failed open.
    }
    if (isPasswordException(error)) {
      throw new PdfOpenError(
        "ENCRYPTED_PDF",
        "PDF is password-protected or encrypted and cannot be opened.",
        error,
      );
    }
    throw new PdfOpenError("NATIVE_TEXT_RECOVERY_FAILURE", "Unable to open PDF document.", error);
  }
}

type PdfOps = {
  paintImageXObject: number;
  paintImageXObjectRepeat: number;
  paintInlineImageXObject: number;
};

async function qualityDecisionForPage(
  page: PdfPageProxy,
  ops: PdfOps,
  nativeItems: PdfNativeTextItem[],
  thresholds: QualityThresholds | undefined,
  allowOperatorSkip: boolean,
): Promise<PdfPageQualityEvaluation> {
  const rawText = nativeItems.map((item) => item.text).join(" ");
  const coverage = estimateCoverage(nativeItems, page);
  const textOnlyMetrics = computePageQualityMetrics({
    rawText,
    textItemCount: nativeItems.length,
    estimatedCoverage: coverage,
    imageOperatorCount: 0,
  });
  const t = thresholds;
  let operatorListSkipped = false;
  let imageOperatorCount = 0;
  if (allowOperatorSkip && canSkipOperatorList(textOnlyMetrics.meaningfulCharacterCount, t)) {
    operatorListSkipped = true;
    imageOperatorCount = 0;
  } else {
    imageOperatorCount = await countImageOperators(page, ops);
  }
  const gateImageCount = operatorListSkipped ? 0 : imageOperatorCount;
  const gateMetrics = computePageQualityMetrics({
    rawText,
    textItemCount: nativeItems.length,
    estimatedCoverage: coverage,
    imageOperatorCount: gateImageCount,
  });
  const decision = decideNativeVsOcr(gateMetrics, t);
  const decisionWithSkipFlag = operatorListSkipped
    ? {
        ...decision,
        metrics: { ...decision.metrics, imageOperatorCount: null },
      }
    : decision;
  return {
    decision: decisionWithSkipFlag,
    operatorListSkipped,
  };
}

async function recoverOnePdfPage(
  document: PdfDocumentProxy,
  pageNumber: number,
  ops: PdfOps,
  context: PdfRecoveryContext,
): Promise<RecoveredPage> {
  const page = await document.getPage(pageNumber);
  try {
    const nativeItems = await extractNativeItems(page);
    const quality = await qualityDecisionForPage(
      page,
      ops,
      nativeItems,
      context.qualityThresholds,
      true,
    );
    const decision = quality.decision;
    const issues: SourceIssue[] = [];

    if (decision.reasons.includes("empty-page-no-images")) {
      issues.push({
        code: "EMPTY_PAGE",
        message: "Page has no native text and no image operators.",
        pageNumber,
      });
    }

    if (!decision.useOcr) {
      return {
        ...buildRecoveredPage({
          runId: context.runId,
          sourceDocumentId: context.sourceDocumentId,
          pageNumber,
          extractionMethod: "NATIVE",
          items: nativeItems,
          sourceIssues: issues,
        }),
        qualityDecision: decision,
      };
    }

    issues.push({
      code: "OCR_REQUIRED",
      message: `Native extraction failed quality gate: ${decision.reasons.join(", ")}.`,
      pageNumber,
    });

    const nativeMeaningful = countMeaningfulCharacters(
      nativeItems.map((item) => item.text).join(" "),
    );
    const ocrPage = await ocrPdfPage(page, pageNumber, context, [...issues]);
    const ocrMeaningful = countMeaningfulCharacters(ocrPage.canonicalText);

    if (ocrPage.canonicalText.trim().length === 0 || ocrMeaningful <= nativeMeaningful) {
      if (isGarbageOcrReasons(decision.reasons)) {
        issues.push({
          code: "UNREADABLE_DOCUMENT",
          message: "Native text failed quality checks and OCR did not recover readable text.",
          pageNumber,
        });
        return {
          ...buildRecoveredPage({
            runId: context.runId,
            sourceDocumentId: context.sourceDocumentId,
            pageNumber,
            extractionMethod: "NATIVE",
            items: [],
            sourceIssues: issues,
          }),
          qualityDecision: decision,
        };
      }
      issues.push({
        code: "OCR_UNAVAILABLE",
        message: "OCR was required but did not improve text; native extraction retained.",
        pageNumber,
      });
      return {
        ...buildRecoveredPage({
          runId: context.runId,
          sourceDocumentId: context.sourceDocumentId,
          pageNumber,
          extractionMethod: "NATIVE",
          items: nativeItems,
          sourceIssues: issues,
        }),
        qualityDecision: decision,
      };
    }

    return { ...ocrPage, qualityDecision: decision, sourceIssues: issues };
  } finally {
    try {
      await page.cleanup();
    } catch {
      // Best-effort cleanup.
    }
  }
}

async function extractNativeItems(page: PdfPageProxy): Promise<PdfNativeTextItem[]> {
  const content = await page.getTextContent();
  const raw: PdfNativeTextItem[] = [];
  for (const item of content.items) {
    if (!item || typeof item !== "object" || !("str" in item) || typeof item.str !== "string") {
      continue;
    }
    if (item.str.trim().length === 0) {
      continue;
    }
    const transform = "transform" in item && Array.isArray(item.transform) ? item.transform : undefined;
    const width = "width" in item && typeof item.width === "number" ? item.width : 0;
    const height = "height" in item && typeof item.height === "number" ? item.height : 0;
    const hasEOL = "hasEOL" in item && item.hasEOL === true;
    if (transform !== undefined) {
      raw.push({
        text: item.str,
        hasEOL,
        boundingBox: {
          x: transform[4] ?? 0,
          y: transform[5] ?? 0,
          width,
          height,
        },
      });
    } else {
      raw.push({ text: item.str, hasEOL });
    }
  }
  return joinPdfNativeItems(raw);
}

async function countImageOperators(page: PdfPageProxy, ops: PdfOps): Promise<number> {
  const operators = await page.getOperatorList();
  let count = 0;
  for (const fn of operators.fnArray) {
    if (
      fn === ops.paintImageXObject ||
      fn === ops.paintImageXObjectRepeat ||
      fn === ops.paintInlineImageXObject
    ) {
      count += 1;
    }
  }
  return count;
}

function estimateCoverage(
  items: readonly { boundingBox?: { width: number; height: number } }[],
  page: PdfPageProxy,
): number {
  const viewport = page.getViewport({ scale: 1 });
  const pageArea = viewport.width * viewport.height;
  if (pageArea <= 0) {
    return 0;
  }
  let textArea = 0;
  for (const item of items) {
    if (item.boundingBox) {
      textArea += item.boundingBox.width * item.boundingBox.height;
    }
  }
  return Math.min(1, textArea / pageArea);
}

async function ocrPdfPage(
  page: PdfPageProxy,
  pageNumber: number,
  context: PdfRecoveryContext,
  issues: SourceIssue[],
): Promise<RecoveredPage> {
  if (context.ocrEngine === undefined) {
    return buildRecoveredPage({
      runId: context.runId,
      sourceDocumentId: context.sourceDocumentId,
      pageNumber,
      extractionMethod: "OCR",
      items: [],
      sourceIssues: issues,
    });
  }

  try {
    const rasterizer =
      context.rasterizer ??
      (context.resolvePageRasterizer ? await context.resolvePageRasterizer() : undefined);
    if (rasterizer === undefined) {
      return buildRecoveredPage({
        runId: context.runId,
        sourceDocumentId: context.sourceDocumentId,
        pageNumber,
        extractionMethod: "OCR",
        items: [],
        sourceIssues: issues,
      });
    }
    const image = await rasterizer.rasterizePdfPage(page);
    const result = await context.ocrEngine.recognizePage(image, {
      runId: context.runId,
      stepId: context.stepId,
      sourceDocumentId: context.sourceDocumentId,
      pageNumber,
    });
    const recovered = buildRecoveredPage({
      runId: context.runId,
      sourceDocumentId: context.sourceDocumentId,
      pageNumber,
      extractionMethod: "OCR",
      items: result.lines.map((line) =>
        line.boundingBox === undefined
          ? { text: line.text }
          : { text: line.text, boundingBox: line.boundingBox },
      ),
      sourceIssues: issues,
    });
    if (recovered.canonicalText.trim().length === 0) {
      issues.push({
        code: "LOW_TEXT_RECOVERY",
        message: "OCR completed but recovered no usable text.",
        pageNumber,
      });
    }
    return { ...recovered, sourceIssues: issues };
  } catch {
    issues.push({
      code: "OCR_FAILED",
      message: "Local OCR failed for this page.",
      pageNumber,
    });
    return buildRecoveredPage({
      runId: context.runId,
      sourceDocumentId: context.sourceDocumentId,
      pageNumber,
      extractionMethod: "OCR",
      items: [],
      sourceIssues: issues,
    });
  }
}

function isPasswordException(error: unknown): boolean {
  if (error !== null && typeof error === "object" && "name" in error) {
    const name = (error as { name: string }).name;
    return name === "PasswordException" || name === "PasswordResponses";
  }
  const message = error instanceof Error ? error.message : String(error);
  return /password|encrypt/i.test(message);
}
