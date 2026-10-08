import type { NestIepRecoveredLine, NestIepRecoveredPage } from "@hiveforyou/shared/intake";

import { findConsecutiveWordQuote } from "../document/find-consecutive-word-quote";
import { wordCenterInLegacyBox, type LegacyBoundingBox } from "../document/legacy-bbox";
import type { PageModel, PageWord } from "../document/page-model";
import { parseExtractionUnitId } from "../provenance/parse-extraction-unit-id";
import type { PageWordRange } from "./types";

export { wordRangesOverlap, type PageWordRange } from "./types";

export type V4EvidenceRefInput = {
  sourceDocumentId: string;
  page: number;
  extractionId?: string | null;
  snippet?: string | null;
};

function lineByExtractionId(
  page: NestIepRecoveredPage,
  extractionId: string | null | undefined,
): NestIepRecoveredLine | null {
  const parsed = extractionId ? parseExtractionUnitId(extractionId) : null;
  if (!parsed || parsed.kind !== "line") {
    return null;
  }
  return page.lines.find((line) => line.order === parsed.order) ?? null;
}

function wordsInsideLineBox(
  page: PageModel,
  lineBox: LegacyBoundingBox | undefined,
): { words: PageWord[]; indices: number[] } {
  if (!lineBox) {
    return {
      words: [...page.words],
      indices: page.words.map((_, i) => i),
    };
  }
  const words: PageWord[] = [];
  const indices: number[] = [];
  for (let i = 0; i < page.words.length; i += 1) {
    const word = page.words[i]!;
    if (wordCenterInLegacyBox(word, page.height, lineBox)) {
      words.push(word);
      indices.push(i);
    }
  }
  return { words, indices };
}

/**
 * Map a v4 accepted evidence ref to page word indices using recovered line geometry
 * and consecutive-word snippet matching (same approach as L001 locator-quote tests).
 */
export function mapV4EvidenceRefToWordRange(input: {
  documentId: string;
  recoveredPage: NestIepRecoveredPage;
  pageModel: PageModel;
  ref: V4EvidenceRefInput;
}): PageWordRange | null {
  const snippet = (input.ref.snippet ?? "").trim();
  if (!snippet) {
    return null;
  }
  if (input.pageModel.pageNumber !== input.recoveredPage.pageNumber) {
    return null;
  }
  if (input.ref.page !== input.pageModel.pageNumber) {
    return null;
  }

  const line = lineByExtractionId(input.recoveredPage, input.ref.extractionId);
  const lineBox = line?.boundingBox;
  const { words, indices } = wordsInsideLineBox(input.pageModel, lineBox);
  const match = findConsecutiveWordQuote(words, snippet);
  if (!match) {
    const fallback = findConsecutiveWordQuote(input.pageModel.words, snippet);
    if (!fallback) {
      return null;
    }
    return {
      documentId: input.documentId,
      pageNumber: input.pageModel.pageNumber,
      wordStart: fallback.wordStartIndex,
      wordEnd: fallback.wordEndIndex + 1,
    };
  }

  const wordStart = indices[match.wordStartIndex];
  const wordEnd = indices[match.wordEndIndex]! + 1;
  if (wordStart === undefined) {
    return null;
  }
  return {
    documentId: input.documentId,
    pageNumber: input.pageModel.pageNumber,
    wordStart,
    wordEnd,
  };
}
