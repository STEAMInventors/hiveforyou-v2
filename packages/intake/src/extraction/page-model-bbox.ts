import type { BBox, PageWord } from "@hiveforyou/core/document/page-model";
import type { NestIepBoundingBox } from "@hiveforyou/shared/intake";

/** Legacy recovered-page boxes use PDF user space (origin bottom-left). */
export function pageModelBBoxToLegacy(box: BBox, pageHeight: number): NestIepBoundingBox {
  const [x0, y0Top, x1, y1Top] = box;
  const legacyY = pageHeight - y1Top;
  return {
    x: x0,
    y: legacyY,
    width: x1 - x0,
    height: y1Top - y0Top,
  };
}

export function legacyBBoxToPageModel(box: NestIepBoundingBox, pageHeight: number): BBox {
  const y0Top = pageHeight - (box.y + box.height);
  const y1Top = pageHeight - box.y;
  return [box.x, y0Top, box.x + box.width, y1Top];
}

export function pageWordsToRawTextItems(
  words: readonly PageWord[],
  pageHeight: number,
): Array<{ text: string; boundingBox: NestIepBoundingBox }> {
  return words.map((word) => ({
    text: word.text,
    boundingBox: pageModelBBoxToLegacy(word.bbox, pageHeight),
  }));
}
