import {
  normalizeQuoteForMatch,
  quoteTokensForMatch,
} from "../document/normalize-quote-text";
import type { AssembledDocument, Block } from "../document/assembly";
import type { DocumentPages } from "../document/page-model";
import { findConsecutiveWordQuote } from "../document/find-consecutive-word-quote";
import { findMultilineQuoteInSection } from "../document/find-multiline-quote";
import type { EvidenceSpan, Party, Reference, Statement, Term, Thing } from "./types";
import type { DocumentProfile } from "./types";

export type ValidationDropReason =
  | "quote_empty"
  | "quote_no_match"
  | "quote_not_in_block"
  | "page_missing";

export type ValidatedAtoms = {
  statements: Statement[];
  parties: Party[];
  things: Thing[];
  references: Reference[];
  terms: Term[];
  profiles: DocumentProfile[];
};

export type ValidationMetrics = {
  dropsByReason: Record<ValidationDropReason, number>;
  dropKeysByReason: Record<ValidationDropReason, string[]>;
};

/** Deterministic key for golden diff (documentId + content; map to sha256 in runners). */
export function validationAtomKey(input: {
  documentId: string;
  tier: number;
  attributeRaw: string | null;
  valueNorm: string | null;
  valueRaw: string | null;
  quote: string;
  pageNumber: number;
  blockId: string;
  cellId: string | null;
}): string {
  return [
    input.documentId,
    input.tier,
    input.attributeRaw ?? "",
    input.valueNorm ?? input.valueRaw ?? "",
    input.pageNumber,
    input.blockId,
    input.cellId ?? "",
    input.quote,
  ].join("\u0000");
}

function atomKeyFromStatement(statement: Statement): string {
  const ev = statement.evidence[0];
  return validationAtomKey({
    documentId: statement.documentId,
    tier: statement.tier,
    attributeRaw: statement.attributeRaw,
    valueNorm: statement.valueNorm,
    valueRaw: statement.valueRaw,
    quote: ev?.quote ?? statement.valueRaw ?? "",
    pageNumber: ev?.pageNumber ?? 0,
    blockId: ev?.blockId ?? "",
    cellId: ev?.cellId ?? null,
  });
}

function emptyDropKeys(): Record<ValidationDropReason, string[]> {
  return {
    quote_empty: [],
    quote_no_match: [],
    quote_not_in_block: [],
    page_missing: [],
  };
}

function recordDrop(metrics: ValidationMetrics, reason: ValidationDropReason, key: string): void {
  metrics.dropsByReason[reason] = (metrics.dropsByReason[reason] ?? 0) + 1;
  metrics.dropKeysByReason[reason].push(key);
}

function normalizeWs(text: string): string {
  return normalizeQuoteForMatch(text);
}

function blockExactMatch(block: Block, quote: string): boolean {
  const q = normalizeWs(quote);
  if (normalizeWs(block.text) === q) {
    return true;
  }
  const segJoined = block.segments.map((s) => s.text).join(" ");
  return normalizeWs(segJoined) === q || normalizeWs(block.segments.map((s) => s.text).join(" | ")) === q;
}

function cellExactMatch(assembled: AssembledDocument, quote: string): TableCellHit | null {
  const q = normalizeWs(quote);
  for (const cell of assembled.cells) {
    if (normalizeWs(cell.text) === q) {
      const block = assembled.blocks.find((b) => b.id === cell.blockId);
      if (block) {
        return { block, cellId: `${cell.row}:${cell.col}`, cellText: cell.text, cellBbox: cell.bbox };
      }
    }
  }
  return null;
}

type TableCellHit = {
  block: Block;
  cellId: string;
  cellText: string;
  cellBbox: EvidenceSpan["bbox"];
};

function attachEvidenceFromMatch(
  documentId: string,
  pageNumber: number,
  block: Block,
  quote: string,
  cellId: string | null,
  pageWords: DocumentPages["pages"][number]["words"],
): EvidenceSpan | null {
  const match = findConsecutiveWordQuote(pageWords, quote);
  if (!match) {
    return null;
  }
  return {
    documentId,
    pageNumber,
    blockId: block.id,
    cellId,
    wordRange: [match.wordStartIndex, match.wordEndIndex + 1],
    quote,
    bbox: match.bbox,
  };
}

function evidenceFromMultilineMatch(
  documentId: string,
  quote: string,
  match: NonNullable<ReturnType<typeof findMultilineQuoteInSection>>,
): EvidenceSpan[] {
  return match.spans.map((span) => ({
    documentId,
    pageNumber: span.pageNumber,
    blockId: span.blockId,
    cellId: null,
    wordRange: span.wordRange,
    quote,
    bbox: span.bbox,
  }));
}

export function validateQuote(
  assembled: AssembledDocument,
  pages: DocumentPages,
  quote: string,
): { evidence: EvidenceSpan[]; reason: ValidationDropReason | null } {
  const q = quote.trim();
  if (!q) {
    return { evidence: [], reason: "quote_empty" };
  }

  for (const block of assembled.blocks) {
    if (blockExactMatch(block, q)) {
      const page = pages.pages.find((p) => p.pageNumber === block.pageNumber);
      if (!page) {
        return { evidence: [], reason: "page_missing" };
      }
      const evidence = attachEvidenceFromMatch(
        assembled.documentId,
        block.pageNumber,
        block,
        q,
        null,
        page.words,
      );
      return evidence
        ? { evidence: [evidence], reason: null }
        : { evidence: [], reason: "quote_no_match" };
    }
  }

  const cellHit = cellExactMatch(assembled, q);
  if (cellHit) {
    const page = pages.pages.find((p) => p.pageNumber === cellHit.block.pageNumber);
    if (!page) {
      return { evidence: [], reason: "page_missing" };
    }
    const evidence = attachEvidenceFromMatch(
      assembled.documentId,
      cellHit.block.pageNumber,
      cellHit.block,
      q,
      cellHit.cellId,
      page.words,
    );
    return evidence ? { evidence: [evidence], reason: null } : { evidence: [], reason: "quote_no_match" };
  }

  for (const block of assembled.blocks) {
    const haystacks = [
      block.text,
      block.segments.map((s) => s.text).join(" "),
      block.segments.map((s) => s.text).join(" | "),
    ];
    if (!haystacks.some((h) => h.includes(q))) {
      continue;
    }
    const page = pages.pages.find((p) => p.pageNumber === block.pageNumber);
    if (!page) {
      return { evidence: [], reason: "page_missing" };
    }
    const evidence = attachEvidenceFromMatch(
      assembled.documentId,
      block.pageNumber,
      block,
      q,
      null,
      page.words,
    );
    if (evidence) {
      return { evidence: [evidence], reason: null };
    }
    const multiline = findMultilineQuoteInSection({
      assembled,
      pages,
      quote: q,
      startBlockId: block.id,
    });
    if (multiline) {
      return {
        evidence: evidenceFromMultilineMatch(assembled.documentId, q, multiline),
        reason: null,
      };
    }
  }

  for (const block of assembled.blocks) {
    if (block.kind !== "line" && block.kind !== "form_field") {
      continue;
    }
    const multiline = findMultilineQuoteInSection({
      assembled,
      pages,
      quote: q,
      startBlockId: block.id,
    });
    if (multiline) {
      return {
        evidence: evidenceFromMultilineMatch(assembled.documentId, q, multiline),
        reason: null,
      };
    }
  }

  return { evidence: [], reason: "quote_no_match" };
}

function validateStatementList(
  assembled: AssembledDocument,
  pages: DocumentPages,
  statements: Statement[],
  metrics: ValidationMetrics,
): Statement[] {
  const kept: Statement[] = [];
  for (const statement of statements) {
    const quote = statement.evidence[0]?.quote ?? statement.valueRaw ?? "";
    const { evidence, reason } = validateQuote(assembled, pages, quote);
    if (evidence.length === 0) {
      const dropReason = reason ?? "quote_no_match";
      recordDrop(metrics, dropReason, atomKeyFromStatement(statement));
      continue;
    }
    kept.push({ ...statement, evidence });
  }
  return kept;
}

function validateEvidenceItems<T extends { evidence: EvidenceSpan[] }>(
  assembled: AssembledDocument,
  pages: DocumentPages,
  items: T[],
  metrics: ValidationMetrics,
): T[] {
  const kept: T[] = [];
  for (const item of items) {
    const quote = item.evidence[0]?.quote ?? "";
    const { evidence, reason } = validateQuote(assembled, pages, quote);
    if (evidence.length === 0) {
      const dropReason = reason ?? "quote_no_match";
      const quote = item.evidence[0]?.quote ?? "";
      recordDrop(
        metrics,
        dropReason,
        validationAtomKey({
          documentId: assembled.documentId,
          tier: -1,
          attributeRaw: null,
          valueNorm: null,
          valueRaw: null,
          quote,
          pageNumber: item.evidence[0]?.pageNumber ?? 0,
          blockId: item.evidence[0]?.blockId ?? "",
          cellId: item.evidence[0]?.cellId ?? null,
        }),
      );
      continue;
    }
    kept.push({ ...item, evidence });
  }
  return kept;
}

export function validateAtoms(input: {
  assembled: AssembledDocument;
  pages: DocumentPages;
  statements: Statement[];
  parties: Party[];
  things: Thing[];
  references: Reference[];
  terms: Term[];
  profiles: DocumentProfile[];
}): { validated: ValidatedAtoms; metrics: ValidationMetrics } {
  const metrics: ValidationMetrics = {
    dropsByReason: {
      quote_empty: 0,
      quote_no_match: 0,
      quote_not_in_block: 0,
      page_missing: 0,
    },
    dropKeysByReason: emptyDropKeys(),
  };

  const profiles = input.profiles.map((profile) => ({
    ...profile,
    requests: validateEvidenceItems(
      input.assembled,
      input.pages,
      profile.requests.map((r) => ({ text: r.text, evidence: r.evidence })),
      metrics,
    ).map((r) => ({ text: r.text, evidence: r.evidence })),
  }));

  return {
    validated: {
      statements: validateStatementList(input.assembled, input.pages, input.statements, metrics),
      parties: validateEvidenceItems(input.assembled, input.pages, input.parties, metrics),
      things: validateEvidenceItems(input.assembled, input.pages, input.things, metrics),
      references: validateEvidenceItems(input.assembled, input.pages, input.references, metrics),
      terms: validateEvidenceItems(input.assembled, input.pages, input.terms, metrics),
      profiles,
    },
    metrics,
  };
}
