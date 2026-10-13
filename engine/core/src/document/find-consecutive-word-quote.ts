import { normalizeQuoteForMatch, quoteAtomsForMatch, splitQuoteTokenAtoms } from "./normalize-quote-text";
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

type PageWordUnit = {
  wordStartIndex: number;
  wordEndIndex: number;
  atoms: string[];
};

function isTrailingLineBreakHyphen(text: string): boolean {
  return /[A-Za-z][-\u2010\u2011\u2012\u2013\u2014]$/.test(text.trim());
}

function atomsForPageText(text: string): string[] {
  const split = splitQuoteTokenAtoms(text);
  if (split.length > 0) {
    return split;
  }
  const normalized = normalizeQuoteForMatch(text).toLowerCase();
  return normalized ? [`\u0000${normalized}`] : [];
}

/** Group page words so a line-break hyphen joins the next alphabetic word. */
function pageWordUnits(words: readonly PageWord[]): PageWordUnit[] {
  const units: PageWordUnit[] = [];
  let index = 0;
  while (index < words.length) {
    const wordStartIndex = index;
    let text = words[index]!.text;
    let wordEndIndex = index;
    const next = words[index + 1];
    if (next && isTrailingLineBreakHyphen(text) && /^[A-Za-z]/.test(next.text.trim())) {
      text = `${text.trim().replace(/[-\u2010\u2011\u2012\u2013\u2014]$/, "")}${next.text}`;
      wordEndIndex = index + 1;
      index += 2;
    } else {
      index += 1;
    }
    units.push({
      wordStartIndex,
      wordEndIndex,
      atoms: atomsForPageText(text),
    });
  }
  return units;
}

type AtomRef = {
  atom: string;
  unitIndex: number;
  atomIndexInUnit: number;
};

/**
 * Find a quote as consecutive page words.
 * %, commas, hyphens, and line-break hyphens are token-equivalent.
 * A match must consume each page word it touches — not a substring of that word.
 */
export function findConsecutiveWordQuote(
  words: readonly PageWord[],
  quote: string,
): ConsecutiveWordQuoteMatch | null {
  const quoteAtoms = quoteAtomsForMatch(quote);
  if (quoteAtoms.length === 0) {
    return null;
  }

  const units = pageWordUnits(words);
  const refs: AtomRef[] = [];
  units.forEach((unit, unitIndex) => {
    unit.atoms.forEach((atom, atomIndexInUnit) => {
      refs.push({ atom, unitIndex, atomIndexInUnit });
    });
  });

  for (let start = 0; start <= refs.length - quoteAtoms.length; start += 1) {
    let ok = true;
    for (let offset = 0; offset < quoteAtoms.length; offset += 1) {
      if (refs[start + offset]!.atom !== quoteAtoms[offset]) {
        ok = false;
        break;
      }
    }
    if (!ok) {
      continue;
    }
    const first = refs[start]!;
    const last = refs[start + quoteAtoms.length - 1]!;
    if (first.atomIndexInUnit !== 0) {
      continue;
    }
    const lastUnit = units[last.unitIndex]!;
    if (last.atomIndexInUnit !== lastUnit.atoms.length - 1) {
      continue;
    }
    const wordStartIndex = units[first.unitIndex]!.wordStartIndex;
    const wordEndIndex = lastUnit.wordEndIndex;
    return {
      wordStartIndex,
      wordEndIndex,
      bbox: unionWordBboxes(words.slice(wordStartIndex, wordEndIndex + 1)),
    };
  }

  return null;
}
