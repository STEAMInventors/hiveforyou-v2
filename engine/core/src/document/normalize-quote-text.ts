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
