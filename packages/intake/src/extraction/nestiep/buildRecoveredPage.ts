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

type VisualLine = {
  readonly segmentGroups: readonly RawTextItem[][];
};

type MutableLineSegment = {
  text: string;
  startOffset: number;
  endOffset: number;
  boundingBox?: BoundingBox;
};

export function buildRecoveredPage(input: {
  readonly runId: string;
  readonly sourceDocumentId: string;
  readonly pageNumber: number;
  readonly extractionMethod: ExtractionMethod;
  readonly items: readonly RawTextItem[];
  readonly sourceIssues?: readonly SourceIssue[];
}): RecoveredPage {
  const visualLines = groupIntoVisualLines(input.items);
  const lines: RecoveredLine[] = [];
  const pieces: string[] = [];
  let cursor = 0;

  for (const [order, visualLine] of visualLines.entries()) {
    const segmentTexts = visualLine.segmentGroups.map((group) =>
      canonicalizeLine(group.map((item) => item.text).join(" ")),
    );
    const nonEmptyIndexes = segmentTexts
      .map((text, index) => (text.length > 0 ? index : -1))
      .filter((index) => index >= 0);
    if (nonEmptyIndexes.length === 0) {
      continue;
    }

    if (pieces.length > 0) {
      cursor += 1;
    }
    const lineStartOffset = cursor;
    const segments: MutableLineSegment[] = [];
    for (let s = 0; s < nonEmptyIndexes.length; s += 1) {
      const groupIndex = nonEmptyIndexes[s]!;
      const segmentText = segmentTexts[groupIndex]!;
      if (s > 0) {
        cursor += 1;
      }
      const segmentStart = cursor;
      const segmentEnd = segmentStart + segmentText.length;
      cursor = segmentEnd;
      const group = visualLine.segmentGroups[groupIndex]!;
      const segmentEntry: MutableLineSegment = {
        text: segmentText,
        startOffset: segmentStart,
        endOffset: segmentEnd,
      };
      const segmentBox = unionBoxes(group.map((item) => item.boundingBox));
      if (segmentBox !== undefined) {
        segmentEntry.boundingBox = segmentBox;
      }
      segments.push(segmentEntry);
    }

    const lineText = segments.map((segment) => segment.text).join(" ");
    const lineEndOffset = lineStartOffset + lineText.length;
    cursor = lineEndOffset;

    const line: RecoveredLine = {
      text: lineText,
      startOffset: lineStartOffset,
      endOffset: lineEndOffset,
      order,
      ...(segments.length > 1 ? { segments } : {}),
      ...(unionBoxes(
        visualLine.segmentGroups.flatMap((group) => group.map((item) => item.boundingBox)),
      ) === undefined
        ? {}
        : {
            boundingBox: unionBoxes(
              visualLine.segmentGroups.flatMap((group) => group.map((item) => item.boundingBox)),
            ),
          }),
    };
    pieces.push(lineText);
    lines.push(line);
  }

  const canonicalText = pieces.join("\n");
  const blocks = buildBlocks(lines);
  const sourceIssues = [...(input.sourceIssues ?? [])];
  if (
    canonicalText.trim().length === 0 &&
    !sourceIssues.some((issue) => issue.code === "EMPTY_PAGE")
  ) {
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

/** Wide horizontal gaps split a y-band into separate segments on the same visual line. */
const COLUMN_GAP_HEIGHT_RATIO = 0.5;

function segmentByHorizontalGap(items: readonly RawTextItem[]): RawTextItem[][] {
  if (items.length <= 1) {
    return [items.slice()];
  }
  const sorted = [...items].sort((a, b) => (a.boundingBox?.x ?? 0) - (b.boundingBox?.x ?? 0));
  const segments: RawTextItem[][] = [[sorted[0]!]];
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    const gap =
      (cur.boundingBox?.x ?? 0) - ((prev.boundingBox?.x ?? 0) + (prev.boundingBox?.width ?? 0));
    const prevHeight = prev.boundingBox?.height ?? 12;
    if (gap > Math.max(4, prevHeight * COLUMN_GAP_HEIGHT_RATIO)) {
      segments.push([cur]);
    } else {
      segments[segments.length - 1]!.push(cur);
    }
  }
  return segments;
}

function groupIntoVisualLines(items: readonly RawTextItem[]): VisualLine[] {
  const bands: { y: number; items: RawTextItem[] }[] = [];
  for (const item of items) {
    const y = item.boundingBox?.y ?? 0;
    const existing = bands.find((line) => Math.abs(line.y - y) < 6);
    if (existing) {
      existing.items.push(item);
    } else {
      bands.push({ y, items: [item] });
    }
  }
  bands.sort(
    (a, b) => b.y - a.y || (a.items[0]?.boundingBox?.x ?? 0) - (b.items[0]?.boundingBox?.x ?? 0),
  );
  return bands.map((band) => {
    band.items.sort((a, b) => (a.boundingBox?.x ?? 0) - (b.boundingBox?.x ?? 0));
    return { segmentGroups: segmentByHorizontalGap(band.items) };
  });
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
