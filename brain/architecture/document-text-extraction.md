# Document text extraction (code reference)

Snapshot of intake PDF / image / plain-text extraction and browser PDF rendering. Live source: `engine/intake`, `engine/intake-node`, app wiring in `app/src/lib/intake/intake-service-server.ts`.

## Pipeline

1. **`extractDocument`** (`engine/intake/src/extract-document.ts`) — intake entry point.
2. **`recoverNormalizedDocument`** — magic-byte detection; `text/plain` UTF-8; else PDF or JPEG/PNG handlers.
3. **PDF** — pdfjs legacy `getTextContent`; per-page quality gate; if OCR needed, rasterize (canvas) + `OcrEngine.recognizePage`.
4. **Image** — OCR only.
5. **`buildRecoveredPage` + `canonicalize`** — lines, offsets, `canonicalText`.
6. **`normalizedToExtractionPages` + `assessExtraction`** — flat pages + `SUCCEEDED` / `NEEDS_OCR` / `FAILED`.

**App wiring:** `intake-service-server.ts` passes `resolvePageRasterizer` from `@hiveforyou/intake-node`; `resolveOcrEngine` is not wired in production yet (tests may pass `ocrEngine: null` or inject an engine).

**Browser (Evidence UI):** `pdf-document-client.ts` loads `/pdf.min.mjs` for preview — not used for intake text extraction.

**Production performance:** pdfjs and extraction run on the Node main thread. Do not run full document extraction inside synchronous HTTP request handlers at scale; durable intake (e.g. Inngest steps) should own extract → classify → finalize so web workers stay bounded.

---

## `engine/intake/src/extract-document.ts`

```typescript
import type { NormalizedDocumentExtraction } from "@hiveforyou/shared/intake";

import {
  normalizedToExtractionPages,
  primaryExtractionMethod,
} from "./extraction/map-normalized-to-intake";
import { PdfOpenError } from "./extraction/nestiep/pdf-open-error";
import {
  recoverNormalizedDocument,
  type RecoverDocumentInput,
} from "./extraction/nestiep/recover-document";
import type { OcrEngine } from "./extraction/nestiep/ocrEngine";
import { PLAIN_TEXT_METHOD } from "./extraction/methods";
import type { DocumentExtractionResult, ExtractionPage } from "./types";
import { hasEnoughIdentityText, joinPageText, normalizePageText } from "./sample";

export {
  NATIVE_EXTRACTION_METHOD,
  OCR_EXTRACTION_METHOD,
  PLAIN_TEXT_METHOD,
  PDF_NATIVE_METHOD,
} from "./extraction/methods";

const IMAGE_OR_WORD_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/tiff",
  "image/tif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export type ExtractDocumentInput = {
  documentId: string;
  bytes: Uint8Array;
  mimeType: string | null;
  sourceHash: string;
  runId?: string;
};

export type PdfPageReader = (bytes: Uint8Array) => Promise<ExtractionPage[]>;

export function assessExtraction(input: {
  documentId: string;
  sourceHash: string;
  extractionMethod: string | null;
  pages: ExtractionPage[];
  normalizedExtraction: NormalizedDocumentExtraction;
}): DocumentExtractionResult {
  const pages = input.pages.map((page) => ({
    pageNumber: page.pageNumber,
    text: normalizePageText(page.text),
    extractionMethod: page.extractionMethod,
    boundingBoxes: page.boundingBoxes ?? null,
    regions: page.regions,
  }));
  const text = joinPageText(pages);

  const hasOcrFailure = input.normalizedExtraction.pages.some((page) =>
    page.sourceIssues.some((issue) => issue.code === "OCR_FAILED"),
  );
  const needsOcr =
    pages.length === 0 ||
    !hasEnoughIdentityText(text) ||
    (hasOcrFailure && !hasEnoughIdentityText(text));

  if (needsOcr) {
    return {
      documentId: input.documentId,
      extractionStatus: "NEEDS_OCR",
      text,
      pages,
      extractionMethod: input.extractionMethod,
      sourceHash: input.sourceHash,
      errorCode: null,
      normalizedExtraction: input.normalizedExtraction,
    };
  }
  return {
    documentId: input.documentId,
    extractionStatus: "SUCCEEDED",
    text,
    pages,
    extractionMethod: input.extractionMethod,
    sourceHash: input.sourceHash,
    errorCode: null,
    normalizedExtraction: input.normalizedExtraction,
  };
}

function extractionFailed(
  input: ExtractDocumentInput,
  normalizedExtraction: NormalizedDocumentExtraction | null,
  errorCode: string,
): DocumentExtractionResult {
  return {
    documentId: input.documentId,
    extractionStatus: "FAILED",
    text: "",
    pages: [],
    extractionMethod: null,
    sourceHash: input.sourceHash,
    errorCode,
    normalizedExtraction,
  };
}

export function looksLikePdf(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 5) {
    return false;
  }
  return (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

const EXTRACTION_LOG_PREFIX = "[intake/extract]";

function logExtractionFailure(input: {
  mimeType: string | null;
  byteLength: number;
  error: unknown;
}): void {
  const err = input.error;
  const errorName = err instanceof Error ? err.name : typeof err;
  const errorMessage = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? (err.stack ?? null) : null;
  console.error(EXTRACTION_LOG_PREFIX, "document extraction failed", {
    errorName,
    errorMessage,
    stack,
    mimeType: input.mimeType?.trim().toLowerCase() ?? null,
    byteLength: input.byteLength,
  });
}

export async function extractDocument(
  input: ExtractDocumentInput,
  deps?: {
    ocrEngine?: OcrEngine | null;
    resolveOcrEngine?: () => Promise<OcrEngine | undefined>;
    recover?: (input: RecoverDocumentInput) => Promise<NormalizedDocumentExtraction>;
    resolvePageRasterizer?: () => Promise<import("./extraction/nestiep/rasterize-types").PageRasterizer>;
  },
): Promise<DocumentExtractionResult> {
  const mime = input.mimeType?.trim().toLowerCase() ?? "";
  const recover = deps?.recover ?? recoverNormalizedDocument;

  if (IMAGE_OR_WORD_MIME.has(mime) && mime !== "image/png" && mime !== "image/jpeg" && mime !== "image/jpg") {
    const empty = await recover({
      sourceDocumentId: input.documentId,
      sourceHash: input.sourceHash,
      bytes: input.bytes,
      mimeType: input.mimeType,
      runId: input.runId,
      ocrEngine: undefined,
      ...(deps?.resolvePageRasterizer === undefined
        ? {}
        : { resolvePageRasterizer: deps.resolvePageRasterizer }),
    });
    return assessExtraction({
      documentId: input.documentId,
      sourceHash: input.sourceHash,
      extractionMethod: null,
      pages: [],
      normalizedExtraction: empty,
    });
  }

  const ocrEngine =
    deps?.ocrEngine === null
      ? undefined
      : deps?.ocrEngine ??
        (deps?.resolveOcrEngine ? await deps.resolveOcrEngine() : undefined);

  try {
    const normalized = await recover({
      sourceDocumentId: input.documentId,
      sourceHash: input.sourceHash,
      bytes: input.bytes,
      mimeType: input.mimeType,
      runId: input.runId,
      ocrEngine,
      ...(deps?.resolvePageRasterizer === undefined
        ? {}
        : { resolvePageRasterizer: deps.resolvePageRasterizer }),
    });

    if (normalized.detectedKind === "unknown" && mime !== "text/plain") {
      return assessExtraction({
        documentId: input.documentId,
        sourceHash: input.sourceHash,
        extractionMethod: null,
        pages: [],
        normalizedExtraction: normalized,
      });
    }

    const pages = normalizedToExtractionPages(normalized);
    const extractionMethod =
      normalized.detectedKind === "plain-text"
        ? PLAIN_TEXT_METHOD
        : primaryExtractionMethod(normalized);
    return assessExtraction({
      documentId: input.documentId,
      sourceHash: input.sourceHash,
      extractionMethod,
      pages,
      normalizedExtraction: normalized,
    });
  } catch (error) {
    logExtractionFailure({
      mimeType: input.mimeType,
      byteLength: input.bytes.byteLength,
      error,
    });
    if (error instanceof PdfOpenError && error.code === "ENCRYPTED_PDF") {
      return extractionFailed(input, null, "ENCRYPTED_PDF");
    }
    return extractionFailed(input, null, "EXTRACTION_FAILED");
  }
}
```

## `engine/intake/src/server-extraction.ts`

```typescript
/** Server-side extraction surface (no native Node addons in this entry). */
export type { PageRasterizer, PdfPageProxy } from "./extraction/nestiep/rasterize-types";
export type { OcrEngine, OcrImage, OcrPageResult } from "./extraction/nestiep/ocrEngine";
export {
  recoverNormalizedDocument,
  type RecoverDocumentInput,
} from "./extraction/nestiep/recover-document";
```

## `engine/intake/src/extraction/methods.ts`

```typescript
/** NestIEP Engine 1 extraction methods. */
export const NATIVE_EXTRACTION_METHOD = "NATIVE";
export const OCR_EXTRACTION_METHOD = "OCR";
export const PLAIN_TEXT_METHOD = "plain-text";

/** @deprecated Use NATIVE_EXTRACTION_METHOD — kept for older tests and logs. */
export const PDF_NATIVE_METHOD = NATIVE_EXTRACTION_METHOD;
```

## `engine/intake/src/extraction/map-normalized-to-intake.ts`

```typescript
import type { NormalizedDocumentExtraction } from "@hiveforyou/shared/intake";

import type { ExtractionBoundingBox, ExtractionPage } from "../types";

export function lineBoundingBoxes(
  page: NormalizedDocumentExtraction["pages"][number],
): ExtractionBoundingBox[] | null {
  const boxes = page.lines
    .map((line) => line.boundingBox)
    .filter((box): box is ExtractionBoundingBox => box !== undefined);
  return boxes.length > 0 ? boxes : null;
}

export function normalizedToExtractionPages(
  normalized: NormalizedDocumentExtraction,
): ExtractionPage[] {
  return normalized.pages.map((page) => ({
    pageNumber: page.pageNumber,
    text: page.canonicalText,
    extractionMethod: page.extractionMethod,
    boundingBoxes: lineBoundingBoxes(page),
    regions: page.lines.map((line) => ({
      text: line.text,
      x: line.boundingBox?.x ?? 0,
      y: line.boundingBox?.y ?? 0,
      width: line.boundingBox?.width ?? 0,
      height: line.boundingBox?.height ?? 0,
    })),
  }));
}

/** Primary document-level method label when pages share one method; otherwise `mixed`. */
export function primaryExtractionMethod(normalized: NormalizedDocumentExtraction): string | null {
  if (normalized.pages.length === 0) {
    return null;
  }
  const methods = new Set(normalized.pages.map((page) => page.extractionMethod));
  if (methods.size === 1) {
    return normalized.pages[0]?.extractionMethod ?? null;
  }
  return "mixed";
}
```

## `engine/intake/src/extraction/pdfjs-worker.ts`

```typescript
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

type PdfJsModule = {
  getDocument: (params: Record<string, unknown>) => { promise: Promise<unknown> };
  GlobalWorkerOptions: { workerSrc: string };
  OPS?: {
    paintImageXObject: number;
    paintImageXObjectRepeat: number;
    paintInlineImageXObject: number;
  };
};

export type PdfJsWithOps = {
  getDocument: PdfJsModule["getDocument"];
  OPS: NonNullable<PdfJsModule["OPS"]>;
};

function toWorkerSrc(pathOrUrl: string): string {
  if (
    pathOrUrl.startsWith("file:") ||
    pathOrUrl.startsWith("data:") ||
    pathOrUrl.startsWith("http:") ||
    pathOrUrl.startsWith("https:")
  ) {
    return pathOrUrl;
  }
  return pathToFileURL(pathOrUrl).href;
}

function pdfJsInstallRoots(): string[] {
  const cwd = process.cwd();
  const bases = [cwd, path.join(cwd, ".."), path.join(cwd, "../.."), path.join(cwd, "../../..")];
  const roots: string[] = [];
  for (const base of bases) {
    roots.push(path.join(base, "node_modules", "pdfjs-dist"));
    roots.push(path.join(base, "packages", "intake", "node_modules", "pdfjs-dist"));
    roots.push(path.join(base, "apps", "web", "node_modules", "pdfjs-dist"));
  }
  return roots;
}

function resolvePdfJsMainModuleHref(): string {
  for (const root of pdfJsInstallRoots()) {
    const mainPath = path.join(root, "legacy", "build", "pdf.mjs");
    if (existsSync(mainPath)) {
      return pathToFileURL(mainPath).href;
    }
  }
  throw new Error("pdfjs-dist legacy build could not be resolved from node_modules");
}

function resolveWorkerFileUrl(): string | null {
  for (const root of pdfJsInstallRoots()) {
    const workerPath = path.join(root, "legacy", "build", "pdf.worker.mjs");
    if (existsSync(workerPath)) {
      return toWorkerSrc(workerPath);
    }
  }
  return null;
}

let cachedPdfJs: PdfJsModule | null | undefined;
let workerConfigured = false;

export async function loadPdfJsWithOps(): Promise<PdfJsWithOps> {
  const mod = await loadPdfJs();
  if (!mod.OPS) {
    throw new Error("pdfjs-dist OPS table is unavailable");
  }
  return { getDocument: mod.getDocument, OPS: mod.OPS };
}

export async function loadPdfJs(): Promise<PdfJsModule> {
  if (cachedPdfJs) {
    return cachedPdfJs;
  }
  if (cachedPdfJs === null) {
    throw new Error("pdfjs-dist could not be loaded");
  }
  try {
    const mainHref = resolvePdfJsMainModuleHref();
    const mod = (await import(/* webpackIgnore: true */ mainHref)) as PdfJsModule;
    if (!workerConfigured) {
      const workerSrc = resolveWorkerFileUrl();
      if (workerSrc) {
        mod.GlobalWorkerOptions.workerSrc = workerSrc;
      }
      workerConfigured = true;
    }
    cachedPdfJs = mod;
    return mod;
  } catch (error) {
    cachedPdfJs = null;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`pdfjs-dist could not be loaded: ${message}`);
  }
}
```

## `engine/intake/src/extraction/nestiep/recover-document.ts`

```typescript
import {
  NORMALIZED_EXTRACTION_SCHEMA_VERSION,
  type NormalizedDocumentExtraction,
  type NestIepSourceIssue,
} from "@hiveforyou/shared/intake";

import { buildRecoveredPage } from "./buildRecoveredPage";
import { detectFileType, suppliedMimeAgrees } from "./detectFileType";
import type { RecoveredPage } from "./contracts";
import type { SupportedFileKind } from "./contracts";
import type { RecoveryContext } from "./recovery-context";
import type { OcrEngine } from "./ocrEngine";
import type { QualityThresholds } from "./qualityGate";
import type { PageRasterizer } from "./rasterize-types";

export type RecoverDocumentInput = {
  readonly sourceDocumentId: string;
  readonly sourceHash: string;
  readonly bytes: Uint8Array;
  readonly mimeType: string | null;
  /** Correlates recovered pages (NestIEP `runId`). Defaults to sourceDocumentId. */
  readonly runId?: string;
  readonly stepId?: string;
  readonly ocrEngine?: OcrEngine;
  readonly qualityThresholds?: QualityThresholds;
  readonly rasterizer?: PageRasterizer;
  readonly resolvePageRasterizer?: () => Promise<PageRasterizer>;
};

async function recoverSourcePages(
  bytes: Uint8Array,
  kind: Extract<SupportedFileKind, "pdf" | "jpeg" | "png">,
  context: RecoveryContext,
): Promise<RecoveredPage[]> {
  if (kind === "pdf") {
    const { recoverPdfPages } = await import("./pdfHandler");
    return recoverPdfPages(bytes, context);
  }
  const { recoverImagePages } = await import("./imageHandler");
  return [await recoverImagePages(bytes, kind, context)];
}

export function buildNormalizedDocumentExtraction(input: {
  readonly sourceDocumentId: string;
  readonly sourceHash: string;
  readonly mimeType: string;
  readonly detectedKind: NormalizedDocumentExtraction["detectedKind"];
  readonly documentIssues: readonly NestIepSourceIssue[];
  readonly pages: readonly RecoveredPage[];
}): NormalizedDocumentExtraction {
  const nativePageCount = input.pages.filter((page) => page.extractionMethod === "NATIVE").length;
  const ocrPageCount = input.pages.filter((page) => page.extractionMethod === "OCR").length;
  return {
    schemaVersion: NORMALIZED_EXTRACTION_SCHEMA_VERSION,
    sourceDocumentId: input.sourceDocumentId,
    sourceHash: input.sourceHash,
    mimeType: input.mimeType,
    detectedKind: input.detectedKind,
    statistics: {
      pageCount: input.pages.length,
      nativePageCount,
      ocrPageCount,
    },
    sourceIssues: input.documentIssues,
    pages: input.pages,
  };
}

export async function recoverNormalizedDocument(
  input: RecoverDocumentInput,
): Promise<NormalizedDocumentExtraction> {
  const suppliedMime = input.mimeType?.trim() ?? "";
  const runId = input.runId ?? input.sourceDocumentId;
  const stepId = input.stepId ?? "intake-extract";

  if (suppliedMime === "text/plain") {
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(input.bytes);
    const page = buildRecoveredPage({
      runId,
      sourceDocumentId: input.sourceDocumentId,
      pageNumber: 1,
      extractionMethod: "NATIVE",
      items: decoded.length > 0 ? [{ text: decoded }] : [],
    });
    return buildNormalizedDocumentExtraction({
      sourceDocumentId: input.sourceDocumentId,
      sourceHash: input.sourceHash,
      mimeType: "text/plain",
      detectedKind: "plain-text",
      documentIssues: [],
      pages: [page],
    });
  }

  const detected = detectFileType(input.bytes, suppliedMime);
  const documentIssues: NestIepSourceIssue[] = [];

  if (detected.kind === "unknown") {
    documentIssues.push({
      code: "UNSUPPORTED_FILE",
      message: "File signature is not a supported PDF, JPEG, or PNG.",
    });
    return buildNormalizedDocumentExtraction({
      sourceDocumentId: input.sourceDocumentId,
      sourceHash: input.sourceHash,
      mimeType: suppliedMime || detected.mimeType,
      detectedKind: "unknown",
      documentIssues,
      pages: [],
    });
  }

  if (suppliedMime.length > 0 && !suppliedMimeAgrees(detected, suppliedMime)) {
    documentIssues.push({
      code: "MAGIC_BYTE_MISMATCH",
      message: "Supplied MIME type does not match detected file signature. Detected type was used.",
    });
  }

  const context: RecoveryContext = {
    runId,
    stepId,
    sourceDocumentId: input.sourceDocumentId,
    ...(input.ocrEngine === undefined ? {} : { ocrEngine: input.ocrEngine }),
    ...(input.qualityThresholds === undefined ? {} : { qualityThresholds: input.qualityThresholds }),
    ...(input.rasterizer === undefined ? {} : { rasterizer: input.rasterizer }),
    ...(input.resolvePageRasterizer === undefined
      ? {}
      : { resolvePageRasterizer: input.resolvePageRasterizer }),
  };

  const pages = await recoverSourcePages(input.bytes, detected.kind, context);
  return buildNormalizedDocumentExtraction({
    sourceDocumentId: input.sourceDocumentId,
    sourceHash: input.sourceHash,
    mimeType: detected.mimeType,
    detectedKind: detected.kind,
    documentIssues,
    pages,
  });
}
```

## `engine/intake/src/extraction/nestiep/handlers.ts`

```typescript
import type { RecoveredPage, SupportedFileKind } from "./contracts";
import { recoverImagePages } from "./imageHandler";
import { recoverPdfPages } from "./pdfHandler";
import type { RecoveryContext } from "./recovery-context";

export type { RecoveryContext } from "./recovery-context";

export async function recoverSourcePages(
  bytes: Uint8Array,
  kind: Extract<SupportedFileKind, "pdf" | "jpeg" | "png">,
  context: RecoveryContext,
): Promise<RecoveredPage[]> {
  if (kind === "pdf") {
    return recoverPdfPages(bytes, context);
  }
  return [await recoverImagePages(bytes, kind, context)];
}
```

## `engine/intake/src/extraction/nestiep/pdfHandler.ts`

```typescript
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
```

## `engine/intake/src/extraction/nestiep/imageHandler.ts`

```typescript
import type { RecoveredPage, SourceIssue, SupportedFileKind } from "./contracts";
import type { OcrEngine } from "./ocrEngine";
import { buildRecoveredPage } from "./buildRecoveredPage";

export interface ImageRecoveryContext {
  readonly runId: string;
  readonly stepId: string;
  readonly sourceDocumentId: string;
  readonly ocrEngine?: OcrEngine;
}

export async function recoverImagePages(
  bytes: Uint8Array,
  kind: Extract<SupportedFileKind, "jpeg" | "png">,
  context: ImageRecoveryContext,
): Promise<RecoveredPage> {
  const issues: SourceIssue[] = [
    {
      code: "OCR_REQUIRED",
      message: "Image uploads are recovered with local OCR only.",
      pageNumber: 1,
    },
  ];

  if (context.ocrEngine === undefined) {
    issues.push({
      code: "OCR_FAILED",
      message: "Image OCR required but no local OCR engine was configured.",
      pageNumber: 1,
    });
    return buildRecoveredPage({
      runId: context.runId,
      sourceDocumentId: context.sourceDocumentId,
      pageNumber: 1,
      extractionMethod: "OCR",
      items: [],
      sourceIssues: issues,
    });
  }

  try {
    const result = await context.ocrEngine.recognizePage(
      {
        bytes,
        width: 0,
        height: 0,
        mimeType: kind === "jpeg" ? "image/jpeg" : "image/png",
      },
      {
        runId: context.runId,
        stepId: context.stepId,
        sourceDocumentId: context.sourceDocumentId,
        pageNumber: 1,
      },
    );
    return buildRecoveredPage({
      runId: context.runId,
      sourceDocumentId: context.sourceDocumentId,
      pageNumber: 1,
      extractionMethod: "OCR",
      items: result.lines.map((line) =>
        line.boundingBox === undefined
          ? { text: line.text }
          : { text: line.text, boundingBox: line.boundingBox },
      ),
      sourceIssues: issues,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Local OCR failed for an image document.";
    throw new Error(message);
  }
}
```

## `engine/intake/src/extraction/nestiep/ocrEngine.ts`

```typescript
import type { NestIepBoundingBox as BoundingBox } from "@hiveforyou/shared/intake";

export interface OcrLine {
  readonly text: string;
  readonly boundingBox?: BoundingBox;
}

export interface OcrPageResult {
  readonly lines: readonly OcrLine[];
}

export interface OcrPageContext {
  readonly runId: string;
  readonly stepId: string;
  readonly sourceDocumentId: string;
  readonly pageNumber: number;
}

export interface OcrImage {
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly mimeType: "image/png" | "image/jpeg";
}

/** Local OCR only. Implementations must not send page contents to a remote service. */
export interface OcrEngine {
  readonly adapterId: string;
  recognizePage(image: OcrImage, context: OcrPageContext): Promise<OcrPageResult>;
}
```

## `engine/intake/src/extraction/nestiep/detectFileType.ts`

```typescript
import type { SupportedFileKind } from "./contracts";

export interface DetectedFileType {
  readonly kind: SupportedFileKind | "unknown";
  readonly mimeType: string;
}

const PDF_MAGIC = Buffer.from("%PDF");
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function detectFileType(bytes: Uint8Array, suppliedMimeType: string): DetectedFileType {
  if (startsWith(bytes, PDF_MAGIC)) {
    return { kind: "pdf", mimeType: "application/pdf" };
  }
  if (startsWith(bytes, JPEG_MAGIC)) {
    return { kind: "jpeg", mimeType: "image/jpeg" };
  }
  if (startsWith(bytes, PNG_MAGIC)) {
    return { kind: "png", mimeType: "image/png" };
  }
  return {
    kind: "unknown",
    mimeType: suppliedMimeType,
  };
}

export function suppliedMimeAgrees(detected: DetectedFileType, suppliedMimeType: string): boolean {
  const supplied = suppliedMimeType.toLowerCase();
  if (detected.kind === "pdf") {
    return supplied === "application/pdf" || supplied === "application/x-pdf";
  }
  if (detected.kind === "jpeg") {
    return supplied === "image/jpeg" || supplied === "image/jpg";
  }
  if (detected.kind === "png") {
    return supplied === "image/png";
  }
  return false;
}

function startsWith(bytes: Uint8Array, magic: Uint8Array): boolean {
  if (bytes.length < magic.length) {
    return false;
  }
  for (let i = 0; i < magic.length; i += 1) {
    if (bytes[i] !== magic[i]) {
      return false;
    }
  }
  return true;
}
```

## `engine/intake/src/extraction/nestiep/buildRecoveredPage.ts`

```typescript
import type {
  BoundingBox,
  ExtractionMethod,
  RecoveredBlock,
  RecoveredLine,
  RecoveredPage,
  SourceIssue,
} from "./contracts";
import { canonicalizeLine } from "./canonicalize";

export interface RawTextItem {
  readonly text: string;
  readonly boundingBox?: BoundingBox;
}

export function buildRecoveredPage(input: {
  readonly runId: string;
  readonly sourceDocumentId: string;
  readonly pageNumber: number;
  readonly extractionMethod: ExtractionMethod;
  readonly items: readonly RawTextItem[];
  readonly sourceIssues?: readonly SourceIssue[];
}): RecoveredPage {
  const grouped = groupIntoLines(input.items);
  const lines: RecoveredLine[] = [];
  const pieces: string[] = [];
  let cursor = 0;

  for (const [order, group] of grouped.entries()) {
    const text = canonicalizeLine(group.map((item) => item.text).join(" "));
    if (text.length === 0) {
      continue;
    }
    if (pieces.length > 0) {
      cursor += 1;
    }
    const startOffset = cursor;
    const endOffset = startOffset + text.length;
    cursor = endOffset;
    pieces.push(text);
    const line: RecoveredLine = {
      text,
      startOffset,
      endOffset,
      order,
    };
    if (group[0]?.boundingBox !== undefined) {
      (line as { boundingBox?: BoundingBox }).boundingBox = unionBoxes(
        group.map((item) => item.boundingBox),
      );
    }
    lines.push(line);
  }

  const canonicalText = pieces.join("\n");
  const blocks = buildBlocks(lines);
  const sourceIssues = [...(input.sourceIssues ?? [])];
  if (canonicalText.trim().length === 0) {
    sourceIssues.push({
      code: "EMPTY_PAGE",
      message: "No recoverable text on page.",
      pageNumber: input.pageNumber,
    });
  }

  return {
    runId: input.runId,
    sourceDocumentId: input.sourceDocumentId,
    pageNumber: input.pageNumber,
    extractionMethod: input.extractionMethod,
    canonicalText,
    lines,
    blocks,
    sourceIssues,
  };
}

function groupIntoLines(items: readonly RawTextItem[]): RawTextItem[][] {
  const lines: { y: number; items: RawTextItem[] }[] = [];
  for (const item of items) {
    const y = item.boundingBox?.y ?? 0;
    const existing = lines.find((line) => Math.abs(line.y - y) < 6);
    if (existing) {
      existing.items.push(item);
    } else {
      lines.push({ y, items: [item] });
    }
  }
  lines.sort((a, b) => b.y - a.y || (a.items[0]?.boundingBox?.x ?? 0) - (b.items[0]?.boundingBox?.x ?? 0));
  for (const line of lines) {
    line.items.sort((a, b) => (a.boundingBox?.x ?? 0) - (b.boundingBox?.x ?? 0));
  }
  return lines.map((line) => line.items);
}

function buildBlocks(lines: readonly RecoveredLine[]): RecoveredBlock[] {
  if (lines.length === 0) {
    return [];
  }
  return [
    {
      startOffset: lines[0]?.startOffset ?? 0,
      endOffset: lines[lines.length - 1]?.endOffset ?? 0,
      lineIndexes: lines.map((_, index) => index),
      ...(unionBoxes(lines.map((line) => line.boundingBox)) === undefined
        ? {}
        : { boundingBox: unionBoxes(lines.map((line) => line.boundingBox)) }),
    },
  ];
}

function unionBoxes(boxes: readonly (BoundingBox | undefined)[]): BoundingBox | undefined {
  const present = boxes.filter((box): box is BoundingBox => box !== undefined);
  if (present.length === 0) {
    return undefined;
  }
  const minX = Math.min(...present.map((box) => box.x));
  const minY = Math.min(...present.map((box) => box.y));
  const maxX = Math.max(...present.map((box) => box.x + box.width));
  const maxY = Math.max(...present.map((box) => box.y + box.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
```

## `engine/intake/src/extraction/nestiep/qualityGate.ts`

```typescript
import type { PageQualityDecision, PageQualityMetrics } from "./contracts";

export interface QualityThresholds {
  readonly minMeaningfulCharacters: number;
  readonly minPrintableRatio: number;
  readonly maxGarbageRatio: number;
  readonly maxDuplicateTextRatio: number;
  readonly minCoverageWhenSparse: number;
  readonly sparseMeaningfulLimit: number;
}

export const DEFAULT_QUALITY_THRESHOLDS: QualityThresholds = {
  minMeaningfulCharacters: 40,
  minPrintableRatio: 0.72,
  maxGarbageRatio: 0.15,
  maxDuplicateTextRatio: 0.62,
  minCoverageWhenSparse: 0.03,
  sparseMeaningfulLimit: 120,
};

const PRINTABLE = /[\t\n\r\x20-\x7E\u00A1-\u024F\u0400-\u04FF\u2010-\u2027\u2030-\u205E]/;
const MEANINGFUL = /[A-Za-z0-9]/;
// eslint-disable-next-line no-control-regex -- measure extraction garbage, not user input
const GARBAGE = /[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export function computePageQualityMetrics(input: {
  readonly rawText: string;
  readonly textItemCount: number;
  readonly estimatedCoverage: number;
  readonly imageOperatorCount: number;
}): PageQualityMetrics {
  const { rawText, textItemCount, estimatedCoverage, imageOperatorCount } = input;
  const characterCount = rawText.length;
  let meaningful = 0;
  let printable = 0;
  let garbage = 0;
  for (const char of rawText) {
    if (MEANINGFUL.test(char)) meaningful += 1;
    if (PRINTABLE.test(char)) printable += 1;
    if (GARBAGE.test(char)) garbage += 1;
  }
  return {
    characterCount,
    meaningfulCharacterCount: meaningful,
    printableRatio: characterCount === 0 ? 0 : printable / characterCount,
    garbageRatio: characterCount === 0 ? 0 : garbage / characterCount,
    duplicateTextRatio: duplicateRatio(rawText),
    textItemCount,
    estimatedCoverage,
    imageOperatorCount,
  };
}

export function decideNativeVsOcr(
  metrics: PageQualityMetrics,
  thresholds: QualityThresholds = DEFAULT_QUALITY_THRESHOLDS,
): PageQualityDecision {
  const reasons: string[] = [];

  if (metrics.characterCount === 0 && metrics.imageOperatorCount === 0) {
    return { useOcr: false, reasons: ["empty-page-no-images"], metrics };
  }
  if (metrics.characterCount === 0 && metrics.imageOperatorCount > 0) {
    reasons.push("empty-native-text-with-images");
  }
  if (metrics.meaningfulCharacterCount < thresholds.minMeaningfulCharacters) {
    reasons.push("low-meaningful-character-count");
  }
  if (metrics.characterCount > 0 && metrics.printableRatio < thresholds.minPrintableRatio) {
    reasons.push("low-printable-ratio");
  }
  if (metrics.garbageRatio > thresholds.maxGarbageRatio) {
    reasons.push("high-garbage-ratio");
  }
  if (
    metrics.duplicateTextRatio > thresholds.maxDuplicateTextRatio &&
    metrics.meaningfulCharacterCount < 200
  ) {
    reasons.push("high-duplicate-text-ratio");
  }
  if (
    metrics.estimatedCoverage < thresholds.minCoverageWhenSparse &&
    metrics.meaningfulCharacterCount < thresholds.sparseMeaningfulLimit &&
    metrics.imageOperatorCount > 0
  ) {
    reasons.push("sparse-text-coverage-over-images");
  }

  const useOcr = reasons.length > 0;
  return {
    useOcr,
    reasons: useOcr ? reasons : ["native-quality-adequate"],
    metrics,
  };
}

function duplicateRatio(text: string): number {
  const tokens = text
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 2);
  if (tokens.length < 8) {
    return 0;
  }
  const unique = new Set(tokens);
  return 1 - unique.size / tokens.length;
}
```

## `engine/intake/src/extraction/nestiep/canonicalize.ts`

```typescript
const NBSP = /\u00a0/g;
const REPLACEMENT = /\uFFFD/g;
// Extraction artifacts only; not a privacy or security filter.
// eslint-disable-next-line no-control-regex -- strip non-printable extraction noise
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function canonicalizeLine(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(NBSP, " ")
    .replace(REPLACEMENT, "")
    .replace(CONTROL, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function canonicalizePageText(lines: readonly string[]): string {
  const normalized = lines.map((line) => canonicalizeLine(line)).filter((line) => line.length > 0);
  return normalized.join("\n").replace(/\n{3,}/g, "\n\n");
}

export function sliceCanonicalText(canonicalText: string, startOffset: number, endOffset: number): string {
  return canonicalText.slice(startOffset, endOffset);
}
```

## `engine/intake/src/extraction/nestiep/contracts.ts`

```typescript
export type {
  NestIepBoundingBox as BoundingBox,
  NestIepExtractionMethod as ExtractionMethod,
  NestIepPageQualityDecision as PageQualityDecision,
  NestIepPageQualityMetrics as PageQualityMetrics,
  NestIepRecoveredBlock as RecoveredBlock,
  NestIepRecoveredLine as RecoveredLine,
  NestIepRecoveredPage as RecoveredPage,
  NestIepSourceIssue as SourceIssue,
  NestIepSourceIssueCode as SourceIssueCode,
  NestIepSupportedFileKind as SupportedFileKind,
} from "@hiveforyou/shared/intake";
```

## `engine/intake/src/extraction/nestiep/recovery-context.ts`

```typescript
import type { OcrEngine } from "./ocrEngine";
import type { QualityThresholds } from "./qualityGate";
import type { PageRasterizer } from "./rasterize-types";

export interface RecoveryContext {
  readonly runId: string;
  readonly stepId: string;
  readonly sourceDocumentId: string;
  readonly ocrEngine?: OcrEngine;
  readonly qualityThresholds?: QualityThresholds;
  readonly rasterizer?: PageRasterizer;
  readonly resolvePageRasterizer?: () => Promise<PageRasterizer>;
}
```

## `engine/intake/src/extraction/nestiep/pdf-open-error.ts`

```typescript
export class PdfOpenError extends Error {
  readonly code: "ENCRYPTED_PDF" | "NATIVE_TEXT_RECOVERY_FAILURE";

  constructor(code: PdfOpenError["code"], message: string, cause?: unknown) {
    super(message);
    this.name = "PdfOpenError";
    this.code = code;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}
```

## `engine/intake/src/extraction/nestiep/rasterize-types.ts`

```typescript
import type { OcrImage } from "./ocrEngine";

export interface PageRasterizer {
  rasterizePdfPage(page: PdfPageProxy): Promise<OcrImage>;
}

export interface PdfPageProxy {
  getViewport(params: { scale: number }): { width: number; height: number };
  render(params: {
    canvasContext: unknown;
    canvas: unknown;
    viewport: { width: number; height: number };
  }): { promise: Promise<void> };
}
```

## `engine/intake-node/src/canvas-rasterize.ts`

```typescript
import { createCanvas } from "@napi-rs/canvas";

import type { PageRasterizer, PdfPageProxy } from "@hiveforyou/intake/nestiep-rasterize-types";

interface MutableCanvas {
  width: number;
  height: number;
  getContext: (id: "2d") => unknown;
  toBuffer: (mime: "image/png") => Buffer;
}

/** PDF page rasterizer for NestIEP OCR fallback (native addons live in this package, not `@hiveforyou/intake`). */
export function createCanvasPageRasterizer(): PageRasterizer {
  return {
    async rasterizePdfPage(page: PdfPageProxy) {
      const viewport = page.getViewport({ scale: 2 });
      const width = Math.max(1, Math.ceil(viewport.width));
      const height = Math.max(1, Math.ceil(viewport.height));
      const canvas = createCanvas(width, height) as unknown as MutableCanvas;
      const canvasContext = canvas.getContext("2d");
      await page.render({
        canvasContext: canvasContext as never,
        canvas: canvas as never,
        viewport,
      }).promise;
      return {
        bytes: new Uint8Array(canvas.toBuffer("image/png")),
        width,
        height,
        mimeType: "image/png" as const,
      };
    },
  };
}
```

## `engine/intake-node/src/guten-ocr.ts`

```typescript
import type { OcrEngine } from "@hiveforyou/intake/nestiep-ocr-engine";

type BoundingBox = { x: number; y: number; width: number; height: number };

interface GutenTextLine {
  readonly text: string;
  readonly frame?: { top: number; left: number; width: number; height: number };
}

interface GutenOcrInstance {
  detect(
    image: string | { data: Uint8Array; width: number; height: number },
  ): Promise<GutenTextLine[] | { texts: GutenTextLine[] }>;
}

interface GutenOcrModule {
  default: {
    create: (options?: {
      models?: {
        detectionPath?: string;
        recognitionPath?: string;
        dictionaryPath?: string;
      };
    }) => Promise<GutenOcrInstance>;
  };
}

function frameToBox(frame: GutenTextLine["frame"]): BoundingBox | undefined {
  if (frame === undefined) {
    return undefined;
  }
  return { x: frame.left, y: frame.top, width: frame.width, height: frame.height };
}

/** Optional NestIEP PaddleOCR adapter via dynamic ONNX models path. */
export async function createGutenOcrEngine(modelDir?: string): Promise<OcrEngine> {
  let loaded: GutenOcrModule;
  try {
    loaded = (await import("@gutenye/ocr-node")) as GutenOcrModule;
  } catch (error) {
    throw new Error("Guten PaddleOCR adapter is not available.", { cause: error });
  }

  const options =
    modelDir === undefined
      ? {}
      : {
          models: {
            detectionPath: `${modelDir}/det.onnx`,
            recognitionPath: `${modelDir}/rec.onnx`,
            dictionaryPath: `${modelDir}/ppocr_keys_v1.txt`,
          },
        };

  const instance = await loaded.default.create(options);

  return {
    adapterId: "guten-paddleocr-onnx",
    async recognizePage(image, _context) {
      const raw = await instance.detect({
        data: image.bytes,
        width: image.width,
        height: image.height,
      });
      const texts = Array.isArray(raw) ? raw : raw.texts;
      return {
        lines: texts.map((line) => {
          const boundingBox = frameToBox(line.frame);
          return boundingBox === undefined
            ? { text: line.text }
            : { text: line.text, boundingBox };
        }),
      };
    },
  };
}
```

## `engine/intake-node/src/index.ts`

```typescript
export { createCanvasPageRasterizer } from "./canvas-rasterize";
export { createGutenOcrEngine } from "./guten-ocr";
```

## `app/src/lib/intake/intake-service-server.ts`

```typescript
import "server-only";

import "@hiveforyou/domain-packs";
import { classifyIepDocumentLocally, getDomainPackManifest } from "@hiveforyou/domain-packs";
import { requireSessionUserId, UnauthenticatedError } from "@hiveforyou/core";
import {
  decideIntakeDocumentIdentity,
  prepareExtendIntakeRun,
  extractDocument,
  mapWithConcurrency,
  finalizeIntakeRunPack,
  openIntakeRun,
  setIntakeSourceAnalysisDisposition,
  type IntakeExecutionDeps,
  type IntakeRunRecord,
  type IntakeSourceDocument,
  type OpenedIntakeRun,
} from "@hiveforyou/intake";
import { recoverNormalizedDocument } from "@hiveforyou/intake/server-extraction";
import {
  NORMALIZED_EXTRACTION_SCHEMA_VERSION,
  toIntakeEvidenceWorkspaceView,
  type IntakeEvidenceWorkspaceView,
  type IntakePackExecutionSnapshot,
} from "@hiveforyou/shared/intake";

import { readServerEnv } from "@/lib/env/server-env";
import { createSupabaseHiveGateway } from "@/lib/persistence/hive-gateway";
import { SupabaseIntakeRepository } from "@/lib/persistence/supabase-intake";
import {
  SupabaseCaseRepository,
  SupabaseSourceDocumentRepository,
  SupabaseSourceDocumentStorage,
} from "@/lib/persistence/supabase-repositories";
import { createServerSupabaseClient, getAuthenticatedUserId } from "@/lib/supabase/server";

const inFlight = new Map<string, Promise<IntakeRunRecord>>();

export class IntakeCaseNotFoundError extends Error {
  readonly code = "CASE_NOT_FOUND";

  constructor() {
    super("Case was not found for the authenticated user.");
    this.name = "IntakeCaseNotFoundError";
  }
}

export class IntakeDocumentNotFoundError extends Error {
  readonly code = "DOCUMENT_NOT_FOUND";

  constructor() {
    super("A source document was not found for the authenticated user.");
    this.name = "IntakeDocumentNotFoundError";
  }
}

export type StartIntakeBody = {
  caseId?: string;
  sourceDocumentIds?: string[];
  rawIntent?: string | null;
  explicitDomainId?: string | null;
};

async function intakePersistence(userId: string) {
  const env = readServerEnv();
  const supabase = await createServerSupabaseClient();
  const gateway = createSupabaseHiveGateway(supabase);
  return {
    cases: new SupabaseCaseRepository(gateway, userId),
    documents: new SupabaseSourceDocumentRepository(gateway, userId),
    storage: new SupabaseSourceDocumentStorage(gateway, env.HIVE_STORAGE_BUCKET, userId),
    intake: new SupabaseIntakeRepository(gateway, userId),
  };
}

async function buildIntakeExecutionDeps(userId: string): Promise<{
  deps: IntakeExecutionDeps;
  documents: SupabaseSourceDocumentRepository;
  intake: SupabaseIntakeRepository;
}> {
  const { documents, storage, intake } = await intakePersistence(userId);
  const deps: IntakeExecutionDeps = {
    runs: intake,
    identities: intake,
    extractions: intake,
    normalizedExtractions: intake,
    inFlight,
    loadDocuments: async ({ userId: ownerId, caseId: ownerCaseId, sourceDocumentIds: ids }) => {
      const LOAD_DOCUMENT_CONCURRENCY = 3;
      const loaded = await mapWithConcurrency(ids, LOAD_DOCUMENT_CONCURRENCY, async (sourceDocumentId) => {
        const record = await documents.getById(ownerId, sourceDocumentId);
        if (!record || record.caseId !== ownerCaseId) {
          return null;
        }
        const bytes = await storage.get({
          bucket: record.storageBucket,
          path: record.storagePath,
        });
        return {
          sourceDocumentId: record.id,
          mimeType: record.mimeType,
          sha256: record.sha256,
          bytes,
        } satisfies IntakeSourceDocument;
      });
      return loaded.filter((document): document is IntakeSourceDocument => document !== null);
    },
    decide: (sample) =>
      decideIntakeDocumentIdentity(sample, { classifyLocally: classifyIepDocumentLocally }),
    sourceMetadata: async ({ userId: ownerId, sourceDocumentIds: ids }) => {
      const metadata: Record<string, { filename: string; sourceHash: string }> = {};
      for (const sourceDocumentId of ids) {
        const record = await documents.getById(ownerId, sourceDocumentId);
        if (!record) {
          continue;
        }
        metadata[sourceDocumentId] = {
          filename: record.originalFilename,
          sourceHash: record.sha256,
        };
      }
      return metadata;
    },
    extract: (input) =>
      extractDocument(input, {
        recover: (recoverInput) => recoverNormalizedDocument(recoverInput),
        resolvePageRasterizer: async () => {
          const { createCanvasPageRasterizer } = await import(
            "@hiveforyou/intake-node/canvas-rasterize"
          );
          return createCanvasPageRasterizer();
        },
      }),
  };
  return { deps, documents, intake };
}

export async function startIntakeFromRequest(body: StartIntakeBody): Promise<OpenedIntakeRun> {
  readServerEnv();
  const sessionUserId = requireSessionUserId(await getAuthenticatedUserId());
  const caseId = body.caseId?.trim() ?? "";
  const sourceDocumentIds = (body.sourceDocumentIds ?? [])
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  if (!caseId || sourceDocumentIds.length === 0) {
    throw new Error("INTAKE_REQUEST_INVALID");
  }

  const { cases, documents } = await intakePersistence(sessionUserId);
  const { deps } = await buildIntakeExecutionDeps(sessionUserId);
  const caseRecord = await cases.getById(sessionUserId, caseId);
  if (!caseRecord) {
    throw new IntakeCaseNotFoundError();
  }
  for (const sourceDocumentId of sourceDocumentIds) {
    const record = await documents.getById(sessionUserId, sourceDocumentId);
    if (!record || record.caseId !== caseId) {
      throw new IntakeDocumentNotFoundError();
    }
  }

  return openIntakeRun(deps, {
    userId: sessionUserId,
    caseId,
    sourceDocumentIds,
    rawIntent: body.rawIntent ?? null,
    explicitDomainId: body.explicitDomainId ?? null,
  });
}

export async function readIntakeEvidenceWorkspaceView(
  intakeRunId: string,
): Promise<IntakeEvidenceWorkspaceView | null> {
  readServerEnv();
  const sessionUserId = requireSessionUserId(await getAuthenticatedUserId());
  const { intake, documents: sourceDocuments } = await intakePersistence(sessionUserId);
  let run = await intake.getById(sessionUserId, intakeRunId);
  if (!run) {
    return null;
  }
  if (
    run.status !== "RUNNING" &&
    !run.packExecutionJson &&
    (run.resolvedDomainId == null || run.studyPath === "GENERIC_STUDY")
  ) {
    const { deps } = await buildIntakeExecutionDeps(sessionUserId);
    const refinalized = await finalizeIntakeRunPack(deps, run);
    if (
      refinalized.packExecutionJson !== run.packExecutionJson ||
      refinalized.resolvedDomainId !== run.resolvedDomainId ||
      refinalized.studyPath !== run.studyPath
    ) {
      await intake.save(refinalized);
      run = refinalized;
    }
  }
  const identities = await intake.listByRun(sessionUserId, intakeRunId);
  const documents = await Promise.all(
    identities.map(async (identity) => {
      const source = await sourceDocuments.getById(sessionUserId, identity.sourceDocumentId);
      let hasNormalizedExtraction = false;
      if (source) {
        const normalized = await intake.getBySourceHash(
          sessionUserId,
          source.id,
          source.sha256,
        );
        hasNormalizedExtraction =
          normalized !== null &&
          normalized.schemaVersion === NORMALIZED_EXTRACTION_SCHEMA_VERSION &&
          normalized.normalizedExtraction.schemaVersion === NORMALIZED_EXTRACTION_SCHEMA_VERSION;
      }
      return {
        sourceDocumentId: identity.sourceDocumentId,
        processingStatus: identity.processingStatus,
        proposedType: identity.proposedType,
        errorCode: identity.errorCode,
        filename: source?.originalFilename ?? "Document",
        sizeBytes: source?.sizeBytes ?? 0,
        mimeType: source?.mimeType ?? null,
        analysisDisposition: identity.analysisDisposition,
        hasNormalizedExtraction,
      };
    }),
  );
  const packExecution: IntakePackExecutionSnapshot | null = run.packExecutionJson
    ? (JSON.parse(run.packExecutionJson) as IntakePackExecutionSnapshot)
    : null;
  const domainManifest = run.resolvedDomainId
    ? getDomainPackManifest(run.resolvedDomainId)
    : null;
  const displayPurpose =
    run.rawIntent?.trim() ||
    (domainManifest ? `Working in ${domainManifest.name}` : "Your documents");

  return toIntakeEvidenceWorkspaceView({
    run: { id: run.id, status: run.status, caseId: run.caseId },
    documents,
    studyPath: run.studyPath ?? "GENERIC_STUDY",
    purpose: {
      rawIntent: run.rawIntent,
      explicitDomainId: run.explicitDomainId,
      resolvedDomainId: run.resolvedDomainId,
      resolutionSource: run.resolutionSource,
      displayPurpose,
      domainName: domainManifest?.name ?? null,
    },
    packExecution,
  });
}

export async function appendSourcesToIntakeRun(
  intakeRunId: string,
  sourceDocumentIds: string[],
): Promise<{ run: IntakeRunRecord; begin: () => Promise<IntakeRunRecord> }> {
  readServerEnv();
  const sessionUserId = requireSessionUserId(await getAuthenticatedUserId());
  const { deps, documents, intake } = await buildIntakeExecutionDeps(sessionUserId);
  const run = await intake.getById(sessionUserId, intakeRunId);
  if (!run) {
    throw new Error("INTAKE_RUN_NOT_FOUND");
  }
  for (const sourceDocumentId of sourceDocumentIds) {
    const record = await documents.getById(sessionUserId, sourceDocumentId);
    if (!record || record.caseId !== run.caseId) {
      throw new IntakeDocumentNotFoundError();
    }
  }
  return prepareExtendIntakeRun(deps, {
    userId: sessionUserId,
    intakeRunId,
    sourceDocumentIds,
  });
}

export async function discardIntakeSourceFromRun(
  intakeRunId: string,
  sourceDocumentId: string,
  disposition: "PRESENT" | "DISCARDED" = "DISCARDED",
): Promise<IntakeEvidenceWorkspaceView | null> {
  readServerEnv();
  const sessionUserId = requireSessionUserId(await getAuthenticatedUserId());
  const { deps } = await buildIntakeExecutionDeps(sessionUserId);
  await setIntakeSourceAnalysisDisposition(deps, {
    userId: sessionUserId,
    intakeRunId,
    sourceDocumentId,
    disposition,
  });
  return readIntakeEvidenceWorkspaceView(intakeRunId);
}

/** @deprecated Use readIntakeEvidenceWorkspaceView */
export async function readIntakeCustomerView(intakeRunId: string) {
  return readIntakeEvidenceWorkspaceView(intakeRunId);
}

export { UnauthenticatedError };
```

## `app/src/lib/evidence/pdf-document-client.ts`

```typescript
"use client";

type PdfDocumentProxy = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPageProxy>;
};

type PdfViewport = { width: number; height: number };

type PdfPageProxy = {
  getViewport: (params: { scale: number }) => PdfViewport;
  render: (params: {
    canvas: HTMLCanvasElement;
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewport;
  }) => { promise: Promise<void>; cancel?: () => void };
};

type PdfJsModule = {
  getDocument: (params: {
    data: Uint8Array;
    useSystemFonts?: boolean;
  }) => { promise: Promise<PdfDocumentProxy> };
  GlobalWorkerOptions: { workerSrc: string };
};

let pdfjsPromise: Promise<PdfJsModule> | null = null;

const documentCache = new Map<string, Promise<PdfDocumentProxy>>();

/** Served from public/ (sync-pdf-worker.mjs). Must not import pdfjs-dist via Webpack — it breaks at runtime. */
const PUBLIC_PDF_MODULE = "/pdf.min.mjs";
const PUBLIC_PDF_WORKER = "/pdf.worker.min.mjs";

async function importPdfJs(): Promise<PdfJsModule> {
  if (typeof window === "undefined") {
    throw new Error("PDF.js is only available in the browser");
  }
  const moduleUrl = new URL(PUBLIC_PDF_MODULE, window.location.origin).href;
  const loaded = await import(/* webpackIgnore: true */ moduleUrl);
  const record = loaded as Record<string, unknown> & { default?: PdfJsModule };
  const pdfjs =
    record.getDocument && typeof record.getDocument === "function"
      ? (record as PdfJsModule)
      : record.default && typeof record.default.getDocument === "function"
        ? record.default
        : null;
  if (!pdfjs) {
    throw new Error("PDF.js module did not export getDocument");
  }
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(PUBLIC_PDF_WORKER, window.location.origin).href;
  return pdfjs;
}

export function isPdfRenderCancelled(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.name === "RenderingCancelledException" ||
    /cancel/i.test(error.message) ||
    /abort/i.test(error.message)
  );
}

export async function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = importPdfJs();
  }
  return pdfjsPromise;
}

async function fetchPdfBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { credentials: "include" });

  if (!response.ok) {
    throw new Error(`PDF request failed (${response.status})`);
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    throw new Error("PDF request returned JSON (auth or not found)");
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length >= 4) {
    const header = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
    if (header !== "%PDF") {
      throw new Error("Response is not a PDF file");
    }
  }

  return bytes;
}

async function loadPdfDocumentUncached(url: string): Promise<PdfDocumentProxy> {
  const pdfjs = await loadPdfJs();
  const data = await fetchPdfBytes(url);

  const task = pdfjs.getDocument({ data, useSystemFonts: true });
  return task.promise;
}

export async function loadPdfDocument(url: string): Promise<PdfDocumentProxy> {
  let pending = documentCache.get(url);

  if (!pending) {
    pending = loadPdfDocumentUncached(url).catch((error) => {
      documentCache.delete(url);
      throw error;
    });

    documentCache.set(url, pending);
  }

  return pending;
}

export async function renderPdfPageToCanvas(input: {
  page: PdfPageProxy;
  canvas: HTMLCanvasElement;
  scale: number;
}): Promise<{ width: number; height: number }> {
  const viewport = input.page.getViewport({ scale: input.scale });
  const context = input.canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2d context unavailable");
  }

  input.canvas.width = Math.floor(viewport.width);
  input.canvas.height = Math.floor(viewport.height);

  const renderTask = input.page.render({
    canvas: input.canvas,
    canvasContext: context,
    viewport,
  });

  await renderTask.promise;

  return { width: viewport.width, height: viewport.height };
}

export type { PdfDocumentProxy, PdfPageProxy };
```

