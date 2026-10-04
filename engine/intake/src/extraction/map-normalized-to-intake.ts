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
