import type { BBox } from "../document/page-model";
import type { Block, TableCell } from "../document/assembly";
import type { EvidenceSpan } from "./types";

function unionBBox(boxes: BBox[]): BBox {
  if (boxes.length === 0) {
    return [0, 0, 0, 0];
  }
  const x0 = Math.min(...boxes.map((b) => b[0]));
  const y0 = Math.min(...boxes.map((b) => b[1]));
  const x1 = Math.max(...boxes.map((b) => b[2]));
  const y1 = Math.max(...boxes.map((b) => b[3]));
  return [x0, y0, x1, y1];
}

export function evidenceFromBlock(
  block: Block,
  quote: string,
  cellId: string | null = null,
): EvidenceSpan {
  const wordStarts = block.segments.map((s) => s.wordRange[0]);
  const wordEnds = block.segments.map((s) => s.wordRange[1]);
  const start = wordStarts.length > 0 ? Math.min(...wordStarts) : 0;
  const end = wordEnds.length > 0 ? Math.max(...wordEnds) : start;
  return {
    documentId: block.documentId,
    pageNumber: block.pageNumber,
    blockId: block.id,
    cellId,
    wordRange: [start, end],
    quote,
    bbox: unionBBox(block.segments.map((s) => s.bbox)),
  };
}

export function evidenceFromCell(block: Block, cell: TableCell): EvidenceSpan {
  return {
    documentId: block.documentId,
    pageNumber: block.pageNumber,
    blockId: block.id,
    cellId: `${cell.row}:${cell.col}`,
    wordRange: [0, 0],
    quote: cell.text,
    bbox: cell.bbox,
  };
}
