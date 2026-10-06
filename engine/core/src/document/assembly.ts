import type { BBox, DocumentPages, FormFieldValue, PageModel, PageWord } from "./page-model";

export type BlockKind =
  | "title"
  | "heading"
  | "line"
  | "table"
  | "form_field"
  | "option"
  | "furniture"
  | "blank";

export interface Segment {
  text: string;
  bbox: BBox;
  wordRange: [start: number, end: number];
}

export interface Block {
  id: string;
  documentId: string;
  pageNumber: number;
  seq: number;
  kind: BlockKind;
  text: string;
  segments: Segment[];
  bbox: BBox;
  parentBlockId: string | null;
  isEmpty: boolean;
  field?: { label: string; value: string | null; empty: boolean }[];
  option?: { label: string; checked: boolean | null };
  instanceOf?: string;
  continuesTableId?: string;
}

export interface TableCell {
  blockId: string;
  row: number;
  col: number;
  headerCellId: string | null;
  text: string;
  bbox: BBox;
}

export interface AssembledDocument {
  documentId: string;
  blocks: Block[];
  cells: TableCell[];
  instances: { id: string; label: string; blockIds: string[] }[];
}

export const ASSEMBLY_CONFIG = {
  lineBaselineTolerancePt: 6,
  /** Matches buildRecoveredPage horizontal segment split (see also segmentGapMinPt). */
  segmentGapMinAbsolutePt: 4,
  segmentGapHeightRatio: 0.5,
  segmentGapMinPt: 12,
  segmentGapFontMultiplier: 1.6,
  twoColumnGapPt: 60,
  furnitureTopBandPt: 60,
  furnitureBottomBandPt: 80,
  furnitureMinPages: 3,
  tableMinHeaderSegments: 3,
  tableRowContinuationGapPt: 8,
  headingFontSizeRatio: 1.15,
  smallItalicMaxFontSize: 10,
} as const;

type BuiltLine = {
  pageNumber: number;
  segments: Segment[];
  bbox: BBox;
  wordIndices: number[];
  splitFromTwoColumn: boolean;
};

type TableDraft = {
  id: string;
  pageNumber: number;
  headerBlockId: string;
  headerCols: { xLeft: number; xRight: number; headerCellId: string }[];
  rows: { rowIndex: number; cells: { col: number; text: string; bbox: BBox; wordIndices: number[] }[] }[];
  continuesTableId?: string;
};

export function assembleDocument(pages: DocumentPages): AssembledDocument {
  const blocks: Block[] = [];
  const cells: TableCell[] = [];
  let seq = 0;

  const builtByPage = new Map<number, BuiltLine[]>();
  for (const page of pages.pages) {
    builtByPage.set(page.pageNumber, buildVisualLines(page));
  }

  const furnitureTexts = detectFurnitureTexts(pages.pages, builtByPage);

  let currentHeadingId: string | null = null;
  const tableDrafts: TableDraft[] = [];
  const consumedWords = new Set<string>();

  for (const page of pages.pages) {
    const lines = builtByPage.get(page.pageNumber) ?? [];
    const headerLine = lines.reduce<BuiltLine | null>((best, line) => {
      if (lineHasMoney(line)) {
        return best;
      }
      if (line.segments.length < ASSEMBLY_CONFIG.tableMinHeaderSegments) {
        return best;
      }
      if (!best || line.segments.length > best.segments.length) {
        return line;
      }
      return best;
    }, null);
    if (headerLine) {
      for (const wi of headerLine.wordIndices) {
        consumedWords.add(`${page.pageNumber}:${wi}`);
      }
    }
    const tablesOnPage = detectTablesOnPage(page, lines, pages.documentId);
    for (const table of tablesOnPage) {
      for (const row of table.rows) {
        for (const cell of row.cells) {
          for (const wi of cell.wordIndices) {
            consumedWords.add(`${page.pageNumber}:${wi}`);
          }
        }
      }
      tableDrafts.push(table);
    }
  }

  for (const table of tableDrafts) {
    seq += 1;
    const tableBlockId = `${pages.documentId}:p${table.pageNumber}:b${seq}`;
    const headerLine = (builtByPage.get(table.pageNumber) ?? []).find((line) =>
      line.segments.length >= ASSEMBLY_CONFIG.tableMinHeaderSegments,
    );
    blocks.push({
      id: tableBlockId,
      documentId: pages.documentId,
      pageNumber: table.pageNumber,
      seq,
      kind: "table",
      text: headerLine?.segments.map((s) => s.text).join(" | ") ?? "",
      segments: headerLine?.segments ?? [],
      bbox: headerLine?.bbox ?? [0, 0, 0, 0],
      parentBlockId: currentHeadingId,
      isEmpty: false,
      continuesTableId: table.continuesTableId,
    });

    for (const row of table.rows) {
      seq += 1;
      const rowBlockId = `${pages.documentId}:p${table.pageNumber}:b${seq}`;
      const rowSegments: Segment[] = row.cells.map((cell) => ({
        text: cell.text,
        bbox: cell.bbox,
        wordRange: wordRangeFromIndices(cell.wordIndices),
      }));
      const rowText = row.cells.map((c) => c.text).join(" | ");
      blocks.push({
        id: rowBlockId,
        documentId: pages.documentId,
        pageNumber: table.pageNumber,
        seq,
        kind: "line",
        text: rowText,
        segments: rowSegments,
        bbox: unionBBox(row.cells.map((c) => c.bbox)),
        parentBlockId: tableBlockId,
        isEmpty: false,
      });

      for (const cell of row.cells) {
        const header = table.headerCols[cell.col];
        cells.push({
          blockId: rowBlockId,
          row: row.rowIndex,
          col: cell.col,
          headerCellId: header?.headerCellId ?? null,
          text: cell.text,
          bbox: cell.bbox,
        });
      }
    }
  }

  for (const page of pages.pages) {
    const lines = builtByPage.get(page.pageNumber) ?? [];
    for (const line of lines) {
      const lineWords = line.wordIndices.filter(
        (wi) => !consumedWords.has(`${page.pageNumber}:${wi}`),
      );
      if (lineWords.length === 0) {
        continue;
      }

      const segments = segmentsForWordSubset(line, lineWords, page.words);
      const lineText = segments.map((s) => s.text).join(
        segments.length > 1 ? " | " : " ",
      );
      const normalizedFull = normalizeDigits(lineText);
      const isFurniture =
        furnitureTexts.has(normalizedFull) ||
        furnitureTexts.has(normalizeDigits(segments.map((s) => s.text).join(" ")));

      seq += 1;
      const blockId = `${pages.documentId}:p${page.pageNumber}:b${seq}`;

      if (isFurniture) {
        blocks.push({
          id: blockId,
          documentId: pages.documentId,
          pageNumber: page.pageNumber,
          seq,
          kind: "furniture",
          text: lineText,
          segments,
          bbox: line.bbox,
          parentBlockId: currentHeadingId,
          isEmpty: false,
        });
        continue;
      }

      const headingKind = classifyHeading(segments, page.words);
      if (headingKind) {
        const block: Block = {
          id: blockId,
          documentId: pages.documentId,
          pageNumber: page.pageNumber,
          seq,
          kind: headingKind,
          text: segments.map((s) => s.text).join(" "),
          segments,
          bbox: line.bbox,
          parentBlockId: currentHeadingId,
          isEmpty: false,
        };
        blocks.push(block);
        currentHeadingId = blockId;
        continue;
      }

      const fields = parseFields(segments, page.words);
      const options = parseOptions(segments, page.words);
      const formOptions = matchFormFieldOptions(page, line.bbox, pages.formFields);

      if (fields.length > 0) {
        blocks.push({
          id: blockId,
          documentId: pages.documentId,
          pageNumber: page.pageNumber,
          seq,
          kind: "form_field",
          text: lineText,
          segments,
          bbox: line.bbox,
          parentBlockId: currentHeadingId,
          isEmpty: fields.every((f) => f.empty),
          field: fields,
        });
        continue;
      }

      if (options || formOptions) {
        blocks.push({
          id: blockId,
          documentId: pages.documentId,
          pageNumber: page.pageNumber,
          seq,
          kind: "option",
          text: lineText,
          segments,
          bbox: line.bbox,
          parentBlockId: currentHeadingId,
          isEmpty: formOptions?.checked === null && !options,
          option: formOptions ?? options ?? undefined,
        });
        continue;
      }

      const isBlank = segments.every((s) => s.text.trim().length === 0);
      blocks.push({
        id: blockId,
        documentId: pages.documentId,
        pageNumber: page.pageNumber,
        seq,
        kind: isBlank ? "blank" : "line",
        text: lineText,
        segments,
        bbox: line.bbox,
        parentBlockId: currentHeadingId,
        isEmpty: isBlank,
      });
    }
  }

  bindSplitFieldValues(blocks);
  const instances = detectRepeatedFormInstances(blocks);

  return {
    documentId: pages.documentId,
    blocks,
    cells,
    instances,
  };
}

function bindSplitFieldValues(blocks: Block[]): void {
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i]!;
    const fields = block.field;
    if (!fields?.some((f) => f.empty || f.value == null)) {
      continue;
    }
    const next = blocks[i + 1];
    if (!next || next.pageNumber !== block.pageNumber) {
      continue;
    }
    for (const field of fields) {
      if (field.value != null && !field.empty) {
        continue;
      }
      if (/^GOAL_[A-Z0-9_]+$/i.test(next.text.trim())) {
        field.value = next.text.trim();
        field.empty = false;
      }
    }
  }
}

function buildVisualLines(page: PageModel): BuiltLine[] {
  const words = page.words;
  if (words.length === 0) {
    return [];
  }

  type Band = { y: number; indices: number[] };
  const bands: Band[] = [];
  for (let i = 0; i < words.length; i += 1) {
    const w = words[i]!;
    const cy = (w.bbox[1] + w.bbox[3]) / 2;
    const band = bands.find((b) => Math.abs(b.y - cy) <= ASSEMBLY_CONFIG.lineBaselineTolerancePt);
    if (band) {
      band.indices.push(i);
    } else {
      bands.push({ y: cy, indices: [i] });
    }
  }
  bands.sort((a, b) => a.y - b.y || minX(words, a.indices) - minX(words, b.indices));

  const lines: BuiltLine[] = [];
  for (const band of bands) {
    const sorted = [...band.indices].sort((a, b) => words[a]!.bbox[0] - words[b]!.bbox[0]);
    const segmentGroups: number[][] = [[sorted[0]!]];
    for (let i = 1; i < sorted.length; i += 1) {
      const prev = words[sorted[i - 1]!]!;
      const cur = words[sorted[i]!]!;
      const gap = cur.bbox[0] - prev.bbox[2];
      const prevHeight = prev.bbox[3] - prev.bbox[1];
      const threshold = Math.max(
        ASSEMBLY_CONFIG.segmentGapMinAbsolutePt,
        prevHeight * ASSEMBLY_CONFIG.segmentGapHeightRatio,
      );
      if (gap > threshold) {
        segmentGroups.push([sorted[i]!]);
      } else {
        segmentGroups[segmentGroups.length - 1]!.push(sorted[i]!);
      }
    }

    const builtSegments: Segment[] = segmentGroups.map((group) => segmentFromIndices(words, group));
    const lineBbox = unionBBox(builtSegments.map((s) => s.bbox));
    const splitLines = splitTwoColumnLine(page.pageNumber, builtSegments, lineBbox, words);
    lines.push(...splitLines);
  }
  return lines;
}

function splitTwoColumnLine(
  pageNumber: number,
  segments: Segment[],
  bbox: BBox,
  _words: PageWord[],
): BuiltLine[] {
  if (segments.length >= ASSEMBLY_CONFIG.tableMinHeaderSegments) {
    return [
      {
        pageNumber,
        segments,
        bbox,
        wordIndices: expandWordRange(segments),
        splitFromTwoColumn: false,
      },
    ];
  }
  if (
    segments.length === 2 &&
    segments[0]!.text.trimEnd().endsWith(":") &&
    !isMoneyText(segments[1]!.text)
  ) {
    return [
      {
        pageNumber,
        segments,
        bbox,
        wordIndices: expandWordRange(segments),
        splitFromTwoColumn: false,
      },
    ];
  }
  if (segments.length <= 1) {
    return [
      {
        pageNumber,
        segments,
        bbox,
        wordIndices: expandWordRange(segments),
        splitFromTwoColumn: false,
      },
    ];
  }

  const parts: { segments: Segment[]; split: boolean }[] = [{ segments: [segments[0]!], split: false }];
  for (let i = 1; i < segments.length; i += 1) {
    const prev = segments[i - 1]!;
    const cur = segments[i]!;
    const gap = cur.bbox[0] - prev.bbox[2];
    const moneyAfterGap = isMoneyText(cur.text);
    if (gap > ASSEMBLY_CONFIG.twoColumnGapPt && !moneyAfterGap) {
      parts.push({ segments: [cur], split: true });
    } else {
      parts[parts.length - 1]!.segments.push(cur);
    }
  }

  if (parts.length === 1) {
    return [
      {
        pageNumber,
        segments,
        bbox,
        wordIndices: expandWordRange(segments),
        splitFromTwoColumn: false,
      },
    ];
  }

  return parts.map((part) => ({
    pageNumber,
    segments: part.segments,
    bbox: unionBBox(part.segments.map((s) => s.bbox)),
    wordIndices: expandWordRange(part.segments),
    splitFromTwoColumn: part.split,
  }));
}

function detectFurnitureTexts(
  pageModels: readonly PageModel[],
  builtByPage: Map<number, BuiltLine[]>,
): Set<string> {
  const counts = new Map<string, number>();
  const perPage = new Map<string, Set<number>>();

  for (const page of pageModels) {
    const lines = builtByPage.get(page.pageNumber) ?? [];
    for (const line of lines) {
      const text = line.segments.map((s) => s.text).join(" ");
      const cy = (line.bbox[1] + line.bbox[3]) / 2;
      const inBand =
        cy <= ASSEMBLY_CONFIG.furnitureTopBandPt ||
        cy >= page.height - ASSEMBLY_CONFIG.furnitureBottomBandPt;
      if (!inBand) {
        continue;
      }
      const key = normalizeDigits(text);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (!perPage.has(key)) {
        perPage.set(key, new Set());
      }
      perPage.get(key)!.add(page.pageNumber);

      const italicSmall = line.segments.every((seg) => {
        const idx = seg.wordRange[0];
        const w = page.words[idx];
        return (
          w?.italic === true &&
          (w.fontSize ?? ASSEMBLY_CONFIG.smallItalicMaxFontSize) <=
            ASSEMBLY_CONFIG.smallItalicMaxFontSize
        );
      });
      if (italicSmall && text.trim().length > 0) {
        const ikey = `italic:${text.trim()}`;
        counts.set(ikey, (counts.get(ikey) ?? 0) + 1);
        if (!perPage.has(ikey)) {
          perPage.set(ikey, new Set());
        }
        perPage.get(ikey)!.add(page.pageNumber);
      }
    }
  }

  const furniture = new Set<string>();
  for (const [key, count] of counts) {
    const pagesSeen = perPage.get(key)?.size ?? 0;
    if (count >= ASSEMBLY_CONFIG.furnitureMinPages && pagesSeen >= ASSEMBLY_CONFIG.furnitureMinPages) {
      furniture.add(key.startsWith("italic:") ? key.slice("italic:".length) : key);
      if (!key.startsWith("italic:")) {
        furniture.add(key);
      }
    }
  }
  return furniture;
}

function detectTablesOnPage(
  page: PageModel,
  lines: BuiltLine[],
  documentId: string,
): TableDraft[] {
  const headerLine = lines.reduce<BuiltLine | null>((best, line) => {
    if (lineHasMoney(line)) {
      return best;
    }
    if (line.segments.length < ASSEMBLY_CONFIG.tableMinHeaderSegments) {
      return best;
    }
    if (!best || line.segments.length > best.segments.length) {
      return line;
    }
    return best;
  }, null);
  if (!headerLine) {
    return [];
  }

  const headerCols = headerLine.segments.map((seg, col) => ({
    xLeft: seg.bbox[0],
    xRight: seg.bbox[2],
    headerCellId: `${documentId}:p${page.pageNumber}:h${col}`,
  }));

  const headerY = headerLine.bbox[3];
  const candidateLines = lines.filter(
    (line) => line.bbox[1] > headerY + 1 && line !== headerLine && line.segments.length > 0,
  );
  const dataLines: BuiltLine[] = [];
  for (const line of candidateLines) {
    const sectionBreak =
      line.segments[0] != null &&
      /^\d+\.\s+/.test(line.segments[0].text.trim()) &&
      line.bbox[1] > headerY + 24;
    if (sectionBreak) {
      break;
    }
    dataLines.push(line);
  }

  const rows: TableDraft["rows"] = [];
  const usedDataLines = new Set<BuiltLine>();
  let rowIndex = 0;
  let currentRow: (TableDraft["rows"][number] & { lastBottom: number }) | null = null;

  for (const line of dataLines) {
    const startNewRow =
      currentRow === null ||
      (lineStartsTableRow(line, headerCols, currentRow) &&
        rowHasAllColumns(currentRow, headerCols.length));

    if (startNewRow) {
      if (currentRow) {
        rows.push(currentRow);
      }
      rowIndex += 1;
      currentRow = {
        rowIndex,
        cells: assignCellsToColumns(line, headerCols),
        lastBottom: line.bbox[3],
      };
      usedDataLines.add(line);
      continue;
    }

    if (currentRow) {
      mergeRowContinuation(currentRow, line, headerCols);
      currentRow.lastBottom = line.bbox[3];
      usedDataLines.add(line);
    }
  }
  if (currentRow) {
    rows.push(currentRow);
  }

  if (rows.length > 0) {
    const lastRow = rows[rows.length - 1]!;
    for (const line of dataLines) {
      if (usedDataLines.has(line)) {
        continue;
      }
      mergeRowContinuation(lastRow, line, headerCols);
      usedDataLines.add(line);
    }
  }

  if (rows.length === 0) {
    return [];
  }

  return [
    {
      id: `${documentId}:p${page.pageNumber}:table0`,
      pageNumber: page.pageNumber,
      headerBlockId: "",
      headerCols,
      rows,
    },
  ];
}

function assignCellsToColumns(
  line: BuiltLine,
  headerCols: TableDraft["headerCols"],
): { col: number; text: string; bbox: BBox; wordIndices: number[] }[] {
  const cells: { col: number; text: string; bbox: BBox; wordIndices: number[] }[] = [];
  const usedCols = new Set<number>();

  for (const seg of line.segments) {
    const col = nearestColumnForSegment(seg, headerCols, isMoneyText(seg.text));
    if (col >= 0 && !usedCols.has(col)) {
      usedCols.add(col);
      cells.push({
        col,
        text: seg.text,
        bbox: seg.bbox,
        wordIndices: rangeWords(seg.wordRange),
      });
    } else {
      const fallbackCol = headerCols.findIndex((_, i) => !usedCols.has(i));
      const c = fallbackCol >= 0 ? fallbackCol : 0;
      usedCols.add(c);
      const existing = cells.find((cell) => cell.col === c);
      if (existing) {
        existing.text = `${existing.text} ${seg.text}`.trim();
        existing.bbox = unionBBox([existing.bbox, seg.bbox]);
        existing.wordIndices.push(...rangeWords(seg.wordRange));
      } else {
        cells.push({
          col: c,
          text: seg.text,
          bbox: seg.bbox,
          wordIndices: rangeWords(seg.wordRange),
        });
      }
    }
  }

  cells.sort((a, b) => a.col - b.col);
  return cells;
}

function mergeRowContinuation(
  row: TableDraft["rows"][number],
  line: BuiltLine,
  headerCols: TableDraft["headerCols"],
): void {
  const additions = assignCellsToColumns(line, headerCols);
  for (const add of additions) {
    const existing = row.cells.find((c) => c.col === add.col);
    if (existing) {
      existing.text = `${existing.text} ${add.text}`.trim();
      existing.bbox = unionBBox([existing.bbox, add.bbox]);
      existing.wordIndices.push(...add.wordIndices);
    } else {
      row.cells.push(add);
    }
  }
  row.cells.sort((a, b) => a.col - b.col);
}

function rowHasAllColumns(
  row: TableDraft["rows"][number],
  columnCount: number,
): boolean {
  const cols = new Set(row.cells.map((c) => c.col));
  for (let i = 0; i < columnCount; i += 1) {
    if (!cols.has(i)) {
      return false;
    }
  }
  return true;
}

function lineStartsTableRow(
  line: BuiltLine,
  headerCols: TableDraft["headerCols"],
  currentRow?: TableDraft["rows"][number],
): boolean {
  if (
    currentRow &&
    line.segments.length === 1 &&
    line.segments[0]!.text.trim().split(/\s+/).length <= 2
  ) {
    return false;
  }
  const firstText = line.segments[0]?.text.trim() ?? "";
  if (/^totals?$/i.test(firstText)) {
    return true;
  }
  if (isDateLike(firstText)) {
    return true;
  }
  const firstSeg = line.segments[0];
  if (!firstSeg) {
    return false;
  }
  const col0 = headerCols[0];
  if (!col0) {
    return false;
  }
  return Math.abs(firstSeg.bbox[0] - col0.xLeft) < 24;
}

function nearestColumnForSegment(
  seg: Segment,
  headerCols: TableDraft["headerCols"],
  money: boolean,
): number {
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < headerCols.length; i += 1) {
    const col = headerCols[i]!;
    const anchor = money ? col.xRight : col.xLeft;
    const dist = Math.abs(seg.bbox[money ? 2 : 0] - anchor);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

function classifyHeading(segments: Segment[], words: PageWord[]): "title" | "heading" | null {
  const text = segments.map((s) => s.text).join(" ").trim();
  if (/^\d+\.\s+\S/.test(text)) {
    return "heading";
  }
  if (/^(section|part)\s+\d+/i.test(text)) {
    return "heading";
  }
  const avgSize = avgFontSize(segments.flatMap((s) => rangeWords(s.wordRange).map((i) => words[i]!)));
  const pageAvg = avgFontSize(words);
  if (avgSize && pageAvg && avgSize >= pageAvg * ASSEMBLY_CONFIG.headingFontSizeRatio) {
    if (text.length < 80) {
      return text.length < 40 ? "title" : "heading";
    }
  }
  if (/^annual goal$/i.test(text) || /^5\.\s*annual goal/i.test(text)) {
    return "heading";
  }
  return null;
}

function parseFields(
  segments: Segment[],
  words: PageWord[],
): { label: string; value: string | null; empty: boolean }[] {
  const fields: { label: string; value: string | null; empty: boolean }[] = [];
  const full = segments.map((s) => s.text).join(" | ");

  for (const seg of segments) {
    const colon = seg.text.match(/^(.+?):\s*(.*)$/);
    if (colon) {
      const value = colon[2]!.trim();
      fields.push({
        label: colon[1]!.trim(),
        value: value.length > 0 ? value : null,
        empty: value.length === 0 || /^_+$/.test(value),
      });
    }
  }

  const question = full.match(/^(.+\?)\s*(.+)$/);
  if (question && fields.length === 0) {
    fields.push({
      label: question[1]!.trim(),
      value: question[2]!.trim(),
      empty: false,
    });
  }

  if (fields.length === 0 && segments.length >= 2) {
    const last = segments[segments.length - 1]!;
    if (isMoneyText(last.text)) {
      const label = segments
        .slice(0, -1)
        .map((s) => s.text)
        .join(" ")
        .trim();
      if (label.length > 0 && label.length < 40) {
        fields.push({ label, value: last.text, empty: false });
      }
    }
  }

  if (/\bGoal\s*ID\b/i.test(full) || segments.some((s) => /^Goal$/i.test(s.text.trim()))) {
    const valueSeg = segments.find((s) => /GOAL_[A-Z0-9_]+/i.test(s.text));
    const valueMatch = full.match(/GOAL_[A-Z0-9_]+/i);
    const value = valueSeg?.text.trim() ?? valueMatch?.[0] ?? null;
    if (value) {
      const existing = fields.find((f) => f.label === "Goal ID");
      if (existing) {
        existing.value = value;
        existing.empty = false;
      } else {
        fields.push({
          label: "Goal ID",
          value,
          empty: false,
        });
      }
    }
  }

  return fields;
}

function parseOptions(
  segments: Segment[],
  _words: PageWord[],
): { label: string; checked: boolean | null } | null {
  const text = segments.map((s) => s.text).join(" ").trim();
  if (/^☑/.test(text)) {
    return { label: text.replace(/^☑\s*/, ""), checked: true };
  }
  if (/^☐/.test(text)) {
    return { label: text.replace(/^☐\s*/, ""), checked: false };
  }
  if (/^_{3,}\s/.test(text)) {
    return { label: text.replace(/^_{3,}\s*/, ""), checked: false };
  }
  return null;
}

function matchFormFieldOptions(
  page: PageModel,
  lineBbox: BBox,
  formFields: FormFieldValue[],
): { label: string; checked: boolean | null } | null {
  for (const field of formFields) {
    if (field.pageNumber !== page.pageNumber) {
      continue;
    }
    if (field.kind !== "checkbox" && field.kind !== "radio") {
      continue;
    }
    if (bboxOverlap(lineBbox, field.bbox)) {
      return { label: field.name, checked: field.checked };
    }
  }
  return null;
}

function detectRepeatedFormInstances(
  blocks: Block[],
): { id: string; label: string; blockIds: string[] }[] {
  const headingCounts = new Map<string, number>();
  for (const block of blocks) {
    if (block.kind === "heading") {
      const key = block.text.trim();
      headingCounts.set(key, (headingCounts.get(key) ?? 0) + 1);
    }
  }
  const recurring = new Set(
    [...headingCounts.entries()].filter(([, c]) => c >= ASSEMBLY_CONFIG.furnitureMinPages).map(([k]) => k),
  );
  if (recurring.size === 0) {
    return [];
  }

  const instances: { id: string; label: string; blockIds: string[] }[] = [];
  let current: { id: string; label: string; blockIds: string[] } | null = null;

  for (const block of blocks) {
    if (block.kind === "heading" && recurring.has(block.text.trim())) {
      if (current) {
        instances.push(current);
      }
      current = { id: block.text.trim(), label: "", blockIds: [block.id] };
      continue;
    }
    if (current) {
      if (block.kind === "heading" && !recurring.has(block.text.trim())) {
        instances.push(current);
        current = null;
        continue;
      }
      if (current.label === "" && block.kind === "line" && block.text.length < 60) {
        current.label = block.text.trim();
        current.id = `${current.id}::${current.label}`;
      }
      current.blockIds.push(block.id);
    }
  }
  if (current) {
    instances.push(current);
  }
  return instances;
}

function segmentFromIndices(words: PageWord[], indices: number[]): Segment {
  const slice = indices.map((i) => words[i]!);
  const text = slice.map((w) => w.text).join(" ");
  return {
    text,
    bbox: unionBBox(slice.map((w) => w.bbox)),
    wordRange: [indices[0]!, indices[indices.length - 1]! + 1],
  };
}

function segmentsForWordSubset(
  line: BuiltLine,
  wordIndices: number[],
  words: PageWord[],
): Segment[] {
  const set = new Set(wordIndices);
  return line.segments
    .map((seg) => {
      const idxs = rangeWords(seg.wordRange).filter((i) => set.has(i));
      if (idxs.length === 0) {
        return null;
      }
      return segmentFromIndices(words, idxs);
    })
    .filter((s): s is Segment => s !== null);
}

function wordRangeFromIndices(idxs: number[]): [number, number] {
  if (idxs.length === 0) {
    return [0, 0];
  }
  const sorted = [...idxs].sort((a, b) => a - b);
  return [sorted[0]!, sorted[sorted.length - 1]! + 1];
}

function expandWordRange(segments: Segment[]): number[] {
  const out: number[] = [];
  for (const seg of segments) {
    out.push(...rangeWords(seg.wordRange));
  }
  return out;
}

function rangeWords(range: [number, number]): number[] {
  const out: number[] = [];
  for (let i = range[0]; i < range[1]; i += 1) {
    out.push(i);
  }
  return out;
}

function unionBBox(boxes: BBox[]): BBox {
  if (boxes.length === 0) {
    return [0, 0, 0, 0];
  }
  return [
    Math.min(...boxes.map((b) => b[0])),
    Math.min(...boxes.map((b) => b[1])),
    Math.max(...boxes.map((b) => b[2])),
    Math.max(...boxes.map((b) => b[3])),
  ];
}

function minX(words: PageWord[], indices: number[]): number {
  return Math.min(...indices.map((i) => words[i]!.bbox[0]));
}

function avgFontSize(words: readonly PageWord[]): number | null {
  const sizes = words.map((w) => w.fontSize).filter((s): s is number => s != null && s > 0);
  if (sizes.length === 0) {
    return null;
  }
  return sizes.reduce((a, b) => a + b, 0) / sizes.length;
}

function isMoneyText(text: string): boolean {
  return /^\$?\s*-?\d{1,3}(?:,\d{3})*(?:\.\d{2})?\s*$/.test(text.trim());
}

function isDateLike(text: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(text.trim()) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(text.trim());
}

function lineHasMoney(line: BuiltLine): boolean {
  return line.segments.some((s) => isMoneyText(s.text));
}

function isTableHeaderLine(line: BuiltLine): boolean {
  return line.segments.length >= ASSEMBLY_CONFIG.tableMinHeaderSegments;
}

function normalizeDigits(text: string): string {
  return text.replace(/\d+/g, "#");
}

function bboxOverlap(a: BBox, b: BBox): boolean {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
}
