import { loadPdfJsWithOps } from "../pdfjs-worker";
import type { RecoveredPage, SourceIssue } from "./contracts";
import { buildRecoveredPage } from "./buildRecoveredPage";
import { decideNativeVsOcr, computePageQualityMetrics, type QualityThresholds } from "./qualityGate";
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

export async function recoverPdfPages(
  bytes: Uint8Array,
  context: PdfRecoveryContext,
): Promise<RecoveredPage[]> {
  const loaded = await loadPdf(bytes);
  try {
    const pages: RecoveredPage[] = [];
    for (let pageNumber = 1; pageNumber <= loaded.document.numPages; pageNumber += 1) {
      pages.push(await recoverOnePdfPage(loaded.document, pageNumber, loaded.ops, context));
    }
    return pages;
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

async function recoverOnePdfPage(
  document: PdfDocumentProxy,
  pageNumber: number,
  ops: PdfOps,
  context: PdfRecoveryContext,
): Promise<RecoveredPage> {
  const page = await document.getPage(pageNumber);
  try {
    const nativeItems = await extractNativeItems(page);
    const rawText = nativeItems.map((item) => item.text).join(" ");
    const imageOperatorCount = await countImageOperators(page, ops);
    const coverage = estimateCoverage(nativeItems, page);
    const metrics = computePageQualityMetrics({
      rawText,
      textItemCount: nativeItems.length,
      estimatedCoverage: coverage,
      imageOperatorCount,
    });
    const decision = decideNativeVsOcr(metrics, context.qualityThresholds);
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

    const ocrPage = await ocrPdfPage(page, pageNumber, context, issues);
    return { ...ocrPage, qualityDecision: decision };
  } finally {
    try {
      await page.cleanup();
    } catch {
      // Best-effort cleanup.
    }
  }
}

async function extractNativeItems(
  page: PdfPageProxy,
): Promise<{ text: string; boundingBox?: { x: number; y: number; width: number; height: number } }[]> {
  const content = await page.getTextContent();
  const items: { text: string; boundingBox?: { x: number; y: number; width: number; height: number } }[] =
    [];
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
    if (transform !== undefined) {
      items.push({
        text: item.str,
        boundingBox: {
          x: transform[4] ?? 0,
          y: transform[5] ?? 0,
          width,
          height,
        },
      });
    } else {
      items.push({ text: item.str });
    }
  }
  return items;
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
    issues.push({
      code: "OCR_FAILED",
      message: "OCR required but no local OCR engine was configured.",
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

  try {
    const rasterizer =
      context.rasterizer ??
      (context.resolvePageRasterizer ? await context.resolvePageRasterizer() : undefined);
    if (rasterizer === undefined) {
      issues.push({
        code: "OCR_FAILED",
        message: "OCR required but no PDF rasterizer was configured.",
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
