import type { BBox, PageWord } from "./page-model";

/** Legacy recovered-page boxes use PDF user space (origin bottom-left). */
export type LegacyBoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function legacyBBoxToPageModel(box: LegacyBoundingBox, pageHeight: number): BBox {
  const y0Top = pageHeight - (box.y + box.height);
  const y1Top = pageHeight - box.y;
  return [box.x, y0Top, box.x + box.width, y1Top];
}

export function wordCenterInLegacyBox(
  word: PageWord,
  pageHeight: number,
  box: LegacyBoundingBox,
): boolean {
  const [x0, y0, x1, y1] = word.bbox;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const [bx0, by0, bx1, by1] = legacyBBoxToPageModel(box, pageHeight);
  return cx >= bx0 && cx <= bx1 && cy >= by0 && cy <= by1;
}
