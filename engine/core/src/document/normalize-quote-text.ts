/** Normalize quotes and page words for tolerant exact/substring matching. */
export function normalizeQuoteForMatch(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/\s*\|\s*/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function quoteTokensForMatch(quote: string): string[] {
  const normalized = normalizeQuoteForMatch(quote);
  if (!normalized) {
    return [];
  }
  return normalized.split(" ");
}

/**
 * Split one whitespace token into match atoms.
 * Percent signs, thousands separators, trailing sentence punctuation, and
 * hyphenated compounds become their own atoms. The caller must consume a
 * whole page word — internal atoms are not a substring match.
 */
export function splitQuoteTokenAtoms(token: string): string[] {
  let text = normalizeQuoteForMatch(token).toLowerCase();
  if (!text) {
    return [];
  }
  text = text.replace(/^[("'`[\]]+|[)"'`[\]]+$/g, "");
  text = text.replace(/^[.,;:!?]+|[.,;:!?]+$/g, "");
  if (!text) {
    return [];
  }
  text = text.replace(/(\d),(?=\d{3}(?:\D|$))/g, "$1");
  const parts = text.split("-").map((part) => part.trim()).filter(Boolean);
  const atoms: string[] = [];
  for (const part of parts) {
    const percent = /^(\d+(?:\.\d+)?)%$/.exec(part);
    if (percent) {
      atoms.push(percent[1]!, "%");
      continue;
    }
    atoms.push(part);
  }
  return atoms;
}

export function quoteAtomsForMatch(quote: string): string[] {
  const tokens = quoteTokensForMatch(quote);
  const atoms: string[] = [];
  for (const token of tokens) {
    const split = splitQuoteTokenAtoms(token);
    if (split.length === 0 && normalizeQuoteForMatch(token)) {
      atoms.push(`\u0000${normalizeQuoteForMatch(token).toLowerCase()}`);
      continue;
    }
    atoms.push(...split);
  }
  return atoms;
}
