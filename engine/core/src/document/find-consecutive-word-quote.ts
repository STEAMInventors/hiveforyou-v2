import { normalizeQuoteForMatch, quoteTokensForMatch } from "./normalize-quote-text";
import type { BBox, PageWord } from "./page-model";

export type ConsecutiveWordQuoteMatch = {
  wordStartIndex: number;
  wordEndIndex: number;
  bbox: BBox;
};

function unionWordBboxes(words: readonly PageWord[]): BBox {
  const boxes = words.map((w) => w.bbox);
  const x0 = Math.min(...boxes.map((b) => b[0]));
  const y0 = Math.min(...boxes.map((b) => b[1]));
  const x1 = Math.max(...boxes.map((b) => b[2]));
  const y1 = Math.max(...boxes.map((b) => b[3]));
  return [x0, y0, x1, y1];
}

/** Find quote as consecutive words (whitespace-normalized) with a union bbox. */
export function findConsecutiveWordQuote(
  words: readonly PageWord[],
  quote: string,
): ConsecutiveWordQuoteMatch | null {
  const quoteTokens = quoteTokensForMatch(quote);
  if (quoteTokens.length === 0) {
    return null;
  }

  for (let start = 0; start <= words.length - quoteTokens.length; start += 1) {
    let ok = true;
    for (let t = 0; t < quoteTokens.length; t += 1) {
      if (normalizeQuoteForMatch(words[start + t]!.text) !== quoteTokens[t]) {
        ok = false;
        break;
      }
    }
    if (ok) {
      const slice = words.slice(start, start + quoteTokens.length);
      return {
        wordStartIndex: start,
        wordEndIndex: start + quoteTokens.length - 1,
        bbox: unionWordBboxes(slice),
      };
    }
  }

  return null;
}
