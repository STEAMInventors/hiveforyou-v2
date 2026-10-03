import type { IepLogicalDocumentSpan, IepScanDocument } from "./contracts";
import { identityBoundaries, packetSegmentationNeeded } from "./logical-segmentation";

/** @deprecated Prefer `segmentIepScanDocuments` / `applyLogicalSegmentation`. */
export function splitLogicalDocumentsFromScan(document: IepScanDocument): IepLogicalDocumentSpan[] {
  const pageCount = Math.max(document.pageCount, document.pages.length, 1);
  if (pageCount <= 0) {
    return [];
  }
  const identity = identityBoundaries(document)[0];
  return [{ pageStart: identity?.startPage ?? 1, pageEnd: identity?.endPage ?? pageCount }];
}

/** @deprecated Use `segmentIepScanDocuments` with normalized pages. */
export function splitLogicalDocuments(pageCount: number): IepLogicalDocumentSpan[] {
  if (pageCount <= 0) {
    return [];
  }
  return [{ pageStart: 1, pageEnd: pageCount }];
}

export { packetSegmentationNeeded };
