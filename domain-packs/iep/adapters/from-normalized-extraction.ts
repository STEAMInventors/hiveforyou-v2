import type { NormalizedDocumentExtraction } from "@hiveforyou/shared/intake";

import type { IepScanDocument } from "../document-interpreter/contracts";

export function iepScanDocumentFromNormalized(input: {
  sourceDocumentId: string;
  filename: string;
  mimeType: string;
  normalized: NormalizedDocumentExtraction;
}): IepScanDocument {
  const pages = input.normalized.pages.map((page) => ({
    pageNumber: page.pageNumber,
    text: page.canonicalText,
  }));
  const pageCount = Math.max(pages.length, input.normalized.statistics.pageCount, 1);
  return {
    scanDocumentId: input.sourceDocumentId,
    originalDisplayName: input.filename,
    mimeType: input.mimeType,
    pageCount,
    pages,
    readStatus: pages.some((page) => page.text.trim().length > 0) ? "ok" : "needs_ocr",
    sourceUploadId: input.sourceDocumentId,
  };
}
