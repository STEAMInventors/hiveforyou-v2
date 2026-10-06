import type { Block } from "./assembly";
import type { BBox, DocumentPages, PageWord } from "./page-model";
import { findConsecutiveWordQuote } from "./find-consecutive-word-quote";
import { normalizeQuoteForMatch, quoteTokensForMatch } from "./normalize-quote-text";

export type MultilineQuoteMatch = {
  spans: {
    blockId: string;
    pageNumber: number;
    wordRange: [number, number];
    bbox: BBox;
  }[];
};

type WordRef = {
  blockId: string;
  pageNumber: number;
  wordIndex: number;
  text: string;
};

function blockPlainText(block: Block): string {
  return block.segments.map((s) => s.text).join(" ").trim();
}

function wordsForBlock(block: Block, pageWords: PageWord[]): WordRef[] {
  const indices = new Set<number>();
  for (const seg of block.segments) {
    for (let i = seg.wordRange[0]; i < seg.wordRange[1]; i += 1) {
      indices.add(i);
    }
  }
  return [...indices]
    .sort((a, b) => a - b)
    .map((wordIndex) => ({
      blockId: block.id,
      pageNumber: block.pageNumber,
      wordIndex,
      text: pageWords[wordIndex]?.text ?? "",
    }));
}

function buildRefChain(blocks: Block[], pages: DocumentPages): WordRef[] {
  const refs: WordRef[] = [];
  for (let bi = 0; bi < blocks.length; bi += 1) {
    const block = blocks[bi]!;
    const page = pages.pages.find((p) => p.pageNumber === block.pageNumber);
    if (!page) {
      continue;
    }
    refs.push(...wordsForBlock(block, page.words));
  }
  return refs;
}

function tokenMatchesQuoteAt(refs: WordRef[], blocks: Block[], quoteTokens: string[], start: number): boolean {
  let qi = 0;
  let ri = start;
  while (qi < quoteTokens.length && ri < refs.length) {
    if (normalizeQuoteForMatch(refs[ri]!.text) !== quoteTokens[qi]) {
      return false;
    }
    qi += 1;
    ri += 1;
    if (qi < quoteTokens.length && ri < refs.length) {
      const prevBlockIdx = blocks.findIndex((b) => b.id === refs[ri - 1]!.blockId);
      const nextBlockIdx = blocks.findIndex((b) => b.id === refs[ri]!.blockId);
      if (prevBlockIdx >= 0 && nextBlockIdx > prevBlockIdx && blockPlainText(blocks[prevBlockIdx]!).endsWith("-")) {
        continue;
      }
      if (refs[ri - 1]!.blockId !== refs[ri]!.blockId) {
        // Block boundary without hyphen still splits words in quote with a space (already separate tokens).
      }
    }
  }
  return qi === quoteTokens.length;
}

function unionBboxes(boxes: BBox[]): BBox {
  return [
    Math.min(...boxes.map((b) => b[0])),
    Math.min(...boxes.map((b) => b[1])),
    Math.max(...boxes.map((b) => b[2])),
    Math.max(...boxes.map((b) => b[3])),
  ];
}

/** Match quote across consecutive line blocks in the same section (parent heading). */
export function findMultilineQuoteInSection(input: {
  assembled: { documentId: string; blocks: Block[] };
  pages: DocumentPages;
  quote: string;
  startBlockId: string;
}): MultilineQuoteMatch | null {
  const quoteTokens = quoteTokensForMatch(input.quote);
  if (quoteTokens.length === 0) {
    return null;
  }

  const startBlock = input.assembled.blocks.find((b) => b.id === input.startBlockId);
  if (!startBlock) {
    return null;
  }
  const sectionId = startBlock.parentBlockId ?? `root:${input.assembled.documentId}`;

  const sectionLinesBase = input.assembled.blocks
    .filter(
      (b) =>
        (b.parentBlockId ?? `root:${input.assembled.documentId}`) === sectionId &&
        (b.kind === "line" || b.kind === "form_field") &&
        !b.isEmpty,
    )
    .sort((a, b) => a.pageNumber - b.pageNumber || a.seq - b.seq);

  const lastPage = sectionLinesBase[sectionLinesBase.length - 1]?.pageNumber ?? startBlock.pageNumber;
  const nextPagePrefix = input.assembled.blocks
    .filter(
      (b) =>
        b.pageNumber === lastPage + 1 &&
        (b.parentBlockId ?? `root:${input.assembled.documentId}`) === sectionId &&
        (b.kind === "line" || b.kind === "form_field") &&
        !b.isEmpty,
    )
    .sort((a, b) => a.seq - b.seq)
    .slice(0, 4);
  const sectionLineIds = new Set(sectionLinesBase.map((b) => b.id));
  const sectionLines = [
    ...sectionLinesBase,
    ...nextPagePrefix.filter((b) => !sectionLineIds.has(b.id)),
  ];

  const startIndex = sectionLines.findIndex((b) => b.id === input.startBlockId);
  if (startIndex < 0) {
    return null;
  }

  for (let len = 1; len <= Math.min(6, sectionLines.length - startIndex); len += 1) {
    const chain = sectionLines.slice(startIndex, startIndex + len);
    const refs = buildRefChain(chain, input.pages);
    for (let i = 0; i < refs.length; i += 1) {
      if (!tokenMatchesQuoteAt(refs, chain, quoteTokens, i)) {
        continue;
      }
      const matched = refs.slice(i, i + quoteTokens.length);
      const byBlock = new Map<string, WordRef[]>();
      for (const ref of matched) {
        const bucket = byBlock.get(ref.blockId) ?? [];
        bucket.push(ref);
        byBlock.set(ref.blockId, bucket);
      }
      const spans: MultilineQuoteMatch["spans"] = [];
      for (const [blockId, blockRefs] of byBlock) {
        const block = chain.find((b) => b.id === blockId)!;
        const page = input.pages.pages.find((p) => p.pageNumber === block.pageNumber);
        if (!page) {
          continue;
        }
        const sliceText = blockRefs.map((r) => r.text).join(" ");
        const local = findConsecutiveWordQuote(page.words, sliceText);
        const minIdx = Math.min(...blockRefs.map((r) => r.wordIndex));
        const maxIdx = Math.max(...blockRefs.map((r) => r.wordIndex));
        spans.push({
          blockId,
          pageNumber: block.pageNumber,
          wordRange: local
            ? [local.wordStartIndex, local.wordEndIndex + 1]
            : [minIdx, maxIdx + 1],
          bbox: local?.bbox ?? unionBboxes(blockRefs.map((r) => page.words[r.wordIndex]!.bbox)),
        });
      }
      if (spans.length > 0) {
        return { spans };
      }
    }
  }

  return null;
}
