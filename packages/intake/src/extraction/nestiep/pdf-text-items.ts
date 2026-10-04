export type PdfNativeTextItem = {
  text: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
  hasEOL?: boolean;
};

/**
 * Horizontal gap, as a fraction of the previous item's height, that still
 * counts as kerning. Case 03 draws "8" at x=72 (width 7.784) and "5" at x=82,
 * a 2.216pt gap on 14pt type (0.158× height). A Helvetica word space at that
 * size is about 3.89pt (0.278× height).
 */
const KERNING_GAP_HEIGHT_RATIO = 0.2;

export function joinPdfNativeItems(items: readonly PdfNativeTextItem[]): PdfNativeTextItem[] {
  if (items.length === 0) {
    return [];
  }
  const sorted = [...items].sort((a, b) => {
    const ay = a.boundingBox?.y ?? 0;
    const by = b.boundingBox?.y ?? 0;
    if (Math.abs(ay - by) > 6) {
      return by - ay;
    }
    return (a.boundingBox?.x ?? 0) - (b.boundingBox?.x ?? 0);
  });

  const lines: PdfNativeTextItem[][] = [];
  for (const item of sorted) {
    const y = item.boundingBox?.y ?? 0;
    const band = lines.find((line) => Math.abs((line[0]?.boundingBox?.y ?? 0) - y) < 6);
    if (band) {
      band.push(item);
    } else {
      lines.push([item]);
    }
  }

  const merged: PdfNativeTextItem[] = [];
  for (const line of lines) {
    line.sort((a, b) => (a.boundingBox?.x ?? 0) - (b.boundingBox?.x ?? 0));
    let chunk = "";
    let box: PdfNativeTextItem["boundingBox"];
    for (let i = 0; i < line.length; i += 1) {
      const cur = line[i]!;
      if (i === 0) {
        chunk = cur.text;
        box = cur.boundingBox;
      } else {
        const prev = line[i - 1]!;
        const gap =
          cur.boundingBox && prev.boundingBox
            ? cur.boundingBox.x - (prev.boundingBox.x + prev.boundingBox.width)
            : 1;
        const prevHeight = prev.boundingBox?.height ?? 0;
        const sep = gap > Math.max(1, prevHeight * KERNING_GAP_HEIGHT_RATIO) ? " " : "";
        chunk += sep + cur.text;
        if (box && cur.boundingBox) {
          const maxX = Math.max(box.x + box.width, cur.boundingBox.x + cur.boundingBox.width);
          const minX = Math.min(box.x, cur.boundingBox.x);
          const minY = Math.min(box.y, cur.boundingBox.y);
          const maxY = Math.max(box.y + box.height, cur.boundingBox.y + cur.boundingBox.height);
          box = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
        }
      }
      if (cur.hasEOL) {
        merged.push({ text: chunk, boundingBox: box, hasEOL: true });
        chunk = "";
        box = undefined;
      }
    }
    if (chunk.length > 0) {
      merged.push({ text: chunk, boundingBox: box });
    }
  }
  return merged;
}
