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
  const anyText = pages.some((page) => page.text.trim().length > 0);
  const allText = pages.every((page) => page.text.trim().length > 0);
  const readStatus = !anyText ? "needs_ocr" : allText ? "ok" : "partially_read";
  return {
    scanDocumentId: input.sourceDocumentId,
    originalDisplayName: input.filename,
    mimeType: input.mimeType,
    pageCount,
    pages,
    readStatus,
    sourceUploadId: input.sourceDocumentId,
  };
}
