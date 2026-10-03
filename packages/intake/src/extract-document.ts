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
