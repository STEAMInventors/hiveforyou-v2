import {
  NORMALIZED_EXTRACTION_SCHEMA_VERSION,
  NESTIEP_EXTRACTOR_VERSION,
  type NormalizedDocumentExtraction,
  type NestIepSourceIssue,
} from "@hiveforyou/shared/intake";

import { decodePlainTextBytes, isPlainTextMime } from "../mime";
import { compressPageRanges, unreadablePageNumbers } from "../page-recovery-summary";
import { buildRecoveredPage } from "./buildRecoveredPage";
import { detectFileType, suppliedMimeAgrees } from "./detectFileType";
import type { RecoveredPage, SupportedFileKind } from "./contracts";
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

type RecoverableKind = Extract<SupportedFileKind, "pdf" | "jpeg" | "png">;

function isRecoverableKind(kind: SupportedFileKind | "unknown"): kind is RecoverableKind {
  return kind === "pdf" || kind === "jpeg" || kind === "png";
}

async function recoverSourcePages(
  bytes: Uint8Array,
  kind: RecoverableKind,
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
  const operatorListSkippedPages = input.pages.filter(
    (page) => page.qualityDecision?.metrics.imageOperatorCount === null,
  ).length;
  const unreadable = unreadablePageNumbers(input.pages);
  return {
    schemaVersion: NORMALIZED_EXTRACTION_SCHEMA_VERSION,
    extractorVersion: NESTIEP_EXTRACTOR_VERSION,
    sourceDocumentId: input.sourceDocumentId,
    sourceHash: input.sourceHash,
    mimeType: input.mimeType,
    detectedKind: input.detectedKind,
    statistics: {
      pageCount: input.pages.length,
      nativePageCount,
      ocrPageCount,
      ...(operatorListSkippedPages > 0 ? { operatorListSkippedPages } : {}),
    },
    sourceIssues: input.documentIssues,
    ...(unreadable.length > 0
      ? { unreadablePageRanges: compressPageRanges(unreadable) }
      : {}),
    pages: input.pages,
  };
}

export async function recoverNormalizedDocument(
  input: RecoverDocumentInput,
): Promise<NormalizedDocumentExtraction> {
  const suppliedMime = input.mimeType?.trim() ?? "";
  const runId = input.runId ?? input.sourceDocumentId;
  const stepId = input.stepId ?? "intake-extract";

  if (isPlainTextMime(input.mimeType)) {
    const decoded = decodePlainTextBytes(input.bytes);
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
      mimeType: isPlainTextMime(input.mimeType) ? suppliedMime.split(";")[0]!.trim().toLowerCase() : "text/plain",
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

  if (!isRecoverableKind(detected.kind)) {
    documentIssues.push({
      code: "UNSUPPORTED_FILE",
      message: "Detected file kind is not recoverable.",
    });
    return buildNormalizedDocumentExtraction({
      sourceDocumentId: input.sourceDocumentId,
      sourceHash: input.sourceHash,
      mimeType: detected.mimeType,
      detectedKind: detected.kind,
      documentIssues,
      pages: [],
    });
  }

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
