import type {
  BoundingBox,
  ExtractionMethod,
  RecoveredBlock,
  RecoveredLine,
  RecoveredPage,
  SourceIssue,
} from "./contracts";
import { canonicalizeLine } from "./canonicalize";

export interface RawTextItem {
  readonly text: string;
  readonly boundingBox?: BoundingBox;
}

export function buildRecoveredPage(input: {
  readonly runId: string;
  readonly sourceDocumentId: string;
  readonly pageNumber: number;
  readonly extractionMethod: ExtractionMethod;
  readonly items: readonly RawTextItem[];
  readonly sourceIssues?: readonly SourceIssue[];
}): RecoveredPage {
  const grouped = groupIntoLines(input.items);
  const lines: RecoveredLine[] = [];
  const pieces: string[] = [];
  let cursor = 0;

  for (const [order, group] of grouped.entries()) {
    const text = canonicalizeLine(group.map((item) => item.text).join(" "));
    if (text.length === 0) {
      continue;
    }
    if (pieces.length > 0) {
      cursor += 1;
    }
    const startOffset = cursor;
    const endOffset = startOffset + text.length;
    cursor = endOffset;
    pieces.push(text);
    const line: RecoveredLine = {
      text,
      startOffset,
      endOffset,
      order,
    };
    if (group[0]?.boundingBox !== undefined) {
      (line as { boundingBox?: BoundingBox }).boundingBox = unionBoxes(
        group.map((item) => item.boundingBox),
      );
    }
    lines.push(line);
  }

  const canonicalText = pieces.join("\n");
  const blocks = buildBlocks(lines);
  const sourceIssues = [...(input.sourceIssues ?? [])];
  if (canonicalText.trim().length === 0) {
    sourceIssues.push({
      code: "EMPTY_PAGE",
      message: "No recoverable text on page.",
      pageNumber: input.pageNumber,
    });
  }

  return {
    runId: input.runId,
    sourceDocumentId: input.sourceDocumentId,
    pageNumber: input.pageNumber,
    extractionMethod: input.extractionMethod,
    canonicalText,
    lines,
    blocks,
    sourceIssues,
  };
}

function groupIntoLines(items: readonly RawTextItem[]): RawTextItem[][] {
  const lines: { y: number; items: RawTextItem[] }[] = [];
  for (const item of items) {
    const y = item.boundingBox?.y ?? 0;
    const existing = lines.find((line) => Math.abs(line.y - y) < 6);
    if (existing) {
      existing.items.push(item);
    } else {
      lines.push({ y, items: [item] });
    }
  }
  lines.sort((a, b) => b.y - a.y || (a.items[0]?.boundingBox?.x ?? 0) - (b.items[0]?.boundingBox?.x ?? 0));
  for (const line of lines) {
    line.items.sort((a, b) => (a.boundingBox?.x ?? 0) - (b.boundingBox?.x ?? 0));
  }
  return lines.map((line) => line.items);
}

function buildBlocks(lines: readonly RecoveredLine[]): RecoveredBlock[] {
  if (lines.length === 0) {
    return [];
  }
  return [
    {
      startOffset: lines[0]?.startOffset ?? 0,
      endOffset: lines[lines.length - 1]?.endOffset ?? 0,
      lineIndexes: lines.map((_, index) => index),
      ...(unionBoxes(lines.map((line) => line.boundingBox)) === undefined
        ? {}
        : { boundingBox: unionBoxes(lines.map((line) => line.boundingBox)) }),
    },
  ];
}

function unionBoxes(boxes: readonly (BoundingBox | undefined)[]): BoundingBox | undefined {
  const present = boxes.filter((box): box is BoundingBox => box !== undefined);
  if (present.length === 0) {
    return undefined;
  }
  const minX = Math.min(...present.map((box) => box.x));
  const minY = Math.min(...present.map((box) => box.y));
  const maxX = Math.max(...present.map((box) => box.x + box.width));
  const maxY = Math.max(...present.map((box) => box.y + box.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
