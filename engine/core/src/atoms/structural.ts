import type { AssembledDocument, Block, TableCell } from "../document/assembly";
import type { DocumentPages } from "../document/page-model";
import { evidenceFromBlock } from "./evidence-from-block";
import {
  normalizeAttributeRaw,
  normalizeMoney,
  normalizePartialDate,
  normalizeRateUnit,
  parseDocumentAnchorDate,
} from "./normalize";
import type { Statement, Thing } from "./types";

let statementSeq = 0;

function nextStatementId(prefix: string): string {
  statementSeq += 1;
  return `${prefix}-${statementSeq}`;
}

function rowThingId(documentId: string, rowBlockId: string): string {
  return `thing:row:${documentId}:${rowBlockId}`;
}

function docSubjectId(documentId: string): string {
  return `doc:${documentId}`;
}

function optionEvidenceQuote(block: Block): string {
  if (!block.option) {
    return block.text.trim();
  }
  const mark =
    block.option.checked === true ? "[X]" : block.option.checked === false ? "[ ]" : "[ ]";
  return `${mark} ${block.option.label}`.trim();
}

function forceForOption(checked: boolean | null): Statement["force"] {
  if (checked === true) {
    return "selects";
  }
  if (checked === false) {
    return "not_selected";
  }
  return "observes";
}

function valueNormForRaw(
  raw: string | null,
  anchorDate: string | null,
): string | number | boolean | null {
  if (raw == null) {
    return null;
  }
  const anchor = parseDocumentAnchorDate(anchorDate);
  const date = normalizePartialDate(raw, anchor?.year ?? null, anchor?.month ?? null);
  if (date) {
    return date;
  }
  const money = normalizeMoney(raw);
  if (money != null) {
    return money;
  }
  normalizeRateUnit(raw);
  return raw.trim();
}

function tableHeaderForCol(
  assembled: AssembledDocument,
  tableBlockId: string,
  col: number,
): string {
  const tableBlock = assembled.blocks.find((b) => b.id === tableBlockId);
  if (!tableBlock) {
    return `column_${col}`;
  }
  const headerSeg = tableBlock.segments[col];
  return headerSeg?.text.trim() ?? `column_${col}`;
}

function statementsFromTableRow(
  assembled: AssembledDocument,
  rowBlock: Block,
  cells: TableCell[],
  issuedDate: string | null,
): Statement[] {
  const subjectId = rowThingId(rowBlock.documentId, rowBlock.id);
  const tableId = rowBlock.parentBlockId;
  if (!tableId) {
    return [];
  }
  const out: Statement[] = [];
  for (const cell of cells.filter((c) => c.blockId === rowBlock.id)) {
    const attributeRaw = tableHeaderForCol(assembled, tableId, cell.col);
    if (!cell.text.trim()) {
      continue;
    }
    out.push({
      id: nextStatementId("t0"),
      documentId: rowBlock.documentId,
      tier: 0,
      subjectId,
      attributeRaw,
      attributeKey: null,
      valueRaw: cell.text.trim(),
      valueNorm: valueNormForRaw(cell.text.trim(), issuedDate),
      unit: normalizeRateUnit(cell.text).per,
      appliesFrom: null,
      appliesTo: null,
      conditionRaw: null,
      speakerId: null,
      sourceRefId: null,
      force: "observes",
      isEmpty: false,
      evidence: [evidenceFromBlock(rowBlock, cell.text.trim(), `${cell.row}:${cell.col}`)],
    });
  }
  return out;
}

function pushColonFieldStatements(
  block: Block,
  issuedDate: string | null,
  statements: Statement[],
): void {
  for (let si = 0; si < block.segments.length; si += 1) {
    const seg = block.segments[si]!;
    const colon = seg.text.match(/^(.+?):\s*(.*)$/);
    if (!colon) {
      continue;
    }
    const label = colon[1]!.trim();
    let valueRaw = colon[2]!.trim() || null;
    if (!valueRaw && block.segments[si + 1]) {
      valueRaw = block.segments[si + 1]!.text.trim() || null;
      si += 1;
    }
    if (!label) {
      continue;
    }
    statements.push({
      id: nextStatementId("t0"),
      documentId: block.documentId,
      tier: 0,
      subjectId: docSubjectId(block.documentId),
      attributeRaw: label,
      attributeKey: null,
      valueRaw,
      valueNorm: valueNormForRaw(valueRaw, issuedDate),
      unit: null,
      appliesFrom: null,
      appliesTo: null,
      conditionRaw: null,
      speakerId: null,
      sourceRefId: null,
      force: "observes",
      isEmpty: !valueRaw,
      evidence: [evidenceFromBlock(block, `${label}: ${valueRaw ?? ""}`.trim())],
    });
  }
}

export function extractTier0Structural(input: {
  pages: DocumentPages;
  assembled: AssembledDocument;
  issuedDate?: string | null;
}): { statements: Statement[]; things: Thing[] } {
  statementSeq = 0;
  const issuedDate = input.issuedDate ?? null;
  const statements: Statement[] = [];
  const things: Thing[] = [];
  const tableBlockIds = new Set(
    input.assembled.blocks.filter((b) => b.kind === "table").map((b) => b.id),
  );

  for (const block of input.assembled.blocks) {
    if (block.parentBlockId && tableBlockIds.has(block.parentBlockId)) {
      const cells = input.assembled.cells.filter((c) => c.blockId === block.id);
      statements.push(...statementsFromTableRow(input.assembled, block, cells, issuedDate));
      things.push({
        id: rowThingId(block.documentId, block.id),
        documentId: block.documentId,
        label: block.segments[0]?.text.trim() || block.text.split("|")[0]?.trim() || block.id,
        kind: "table_row",
        evidence: [evidenceFromBlock(block, block.text.trim())],
      });
      continue;
    }

    if (block.kind === "form_field" && block.field) {
      const subjectId = block.instanceOf ?? docSubjectId(block.documentId);
      for (const field of block.field) {
        let valueRaw = field.value;
        if (!valueRaw) {
          const labelSegIndex = block.segments.findIndex((seg) =>
            seg.text.trim().startsWith(`${field.label}:`),
          );
          if (labelSegIndex >= 0 && block.segments[labelSegIndex + 1]) {
            valueRaw = block.segments[labelSegIndex + 1]!.text.trim() || null;
          }
        }
        statements.push({
          id: nextStatementId("t0"),
          documentId: block.documentId,
          tier: 0,
          subjectId,
          attributeRaw: field.label,
          attributeKey: null,
          valueRaw,
          valueNorm: valueNormForRaw(valueRaw, issuedDate),
          unit: null,
          appliesFrom: null,
          appliesTo: null,
          conditionRaw: null,
          speakerId: null,
          sourceRefId: null,
          force: "observes",
          isEmpty: !valueRaw,
          evidence: [evidenceFromBlock(block, `${field.label}: ${valueRaw ?? ""}`.trim())],
        });
      }
      continue;
    }

    if (block.kind === "line") {
      pushColonFieldStatements(block, issuedDate, statements);
      continue;
    }

    if (block.kind === "option" && block.option) {
      statements.push({
        id: nextStatementId("t0"),
        documentId: block.documentId,
        tier: 0,
        subjectId: docSubjectId(block.documentId),
        attributeRaw: block.option.label,
        attributeKey: null,
        valueRaw: block.option.checked === null ? null : String(block.option.checked),
        valueNorm: block.option.checked,
        unit: null,
        appliesFrom: null,
        appliesTo: null,
        conditionRaw: null,
        speakerId: null,
        sourceRefId: null,
        force: forceForOption(block.option.checked),
        isEmpty: false,
        evidence: [evidenceFromBlock(block, block.text.trim())],
      });
    }
  }

  for (const instance of input.assembled.instances) {
    things.push({
      id: instance.id,
      documentId: input.assembled.documentId,
      label: instance.label || instance.id,
      kind: "form_instance",
      evidence: instance.blockIds
        .map((id) => input.assembled.blocks.find((b) => b.id === id))
        .filter((b): b is Block => Boolean(b))
        .slice(0, 1)
        .map((b) => evidenceFromBlock(b, b.text.trim())),
    });
  }

  return { statements, things };
}

export function statementIdentityKey(statement: Statement): string {
  const attribute = statement.attributeKey ?? normalizeAttributeRaw(statement.attributeRaw);
  const value =
    statement.valueNorm === null || statement.valueNorm === undefined
      ? "null"
      : String(statement.valueNorm);
  const range = statement.evidence[0]?.wordRange.join(":") ?? "";
  return `${statement.documentId}|${statement.subjectId}|${attribute}|${value}|${range}`;
}
