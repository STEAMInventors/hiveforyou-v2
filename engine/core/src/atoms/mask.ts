const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/g;
const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/g;
const MDY_DATE = /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g;
const MONEY_PATTERN = /\(?\$[\d,]+(?:\.\d{2})?\)?|\b\d{1,3}(?:,\d{3})+(?:\.\d{2})?\b/g;

export type MaskPlaceholderMap = Map<string, string>;

function isInsideMatch(index: number, length: number, spans: { start: number; end: number }[]): boolean {
  return spans.some((span) => index >= span.start && index < span.end);
}

function collectProtectedSpans(text: string): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  for (const pattern of [ISO_DATE, MDY_DATE, MONEY_PATTERN]) {
    pattern.lastIndex = 0;
    let match = pattern.exec(text);
    while (match) {
      spans.push({ start: match.index, end: match.index + match[0].length });
      match = pattern.exec(text);
    }
  }
  return spans;
}

/**
 * Mask identifier-shaped values for tier-1 model input. Dates and money amounts stay literal.
 */
export function maskIdentifiersForModel(text: string, map: MaskPlaceholderMap): string {
  const protectedSpans = collectProtectedSpans(text);
  let out = text;
  let placeholderSeq = map.size;

  const digitRunPattern = /\d{6,}/g;
  const replacements: { start: number; end: number; placeholder: string }[] = [];

  digitRunPattern.lastIndex = 0;
  let digitMatch = digitRunPattern.exec(text);
  while (digitMatch) {
    const start = digitMatch.index;
    const end = start + digitMatch[0].length;
    if (!isInsideMatch(start, text.length, protectedSpans)) {
      const original = digitMatch[0];
      let placeholder = [...map.entries()].find(([, value]) => value === original)?.[0];
      if (!placeholder) {
        placeholder = `id_${placeholderSeq}`;
        placeholderSeq += 1;
        map.set(placeholder, original);
      }
      replacements.push({ start, end, placeholder });
    }
    digitMatch = digitRunPattern.exec(text);
  }

  SSN_PATTERN.lastIndex = 0;
  let ssnMatch = SSN_PATTERN.exec(text);
  while (ssnMatch) {
    const start = ssnMatch.index;
    const end = start + ssnMatch[0].length;
    const original = ssnMatch[0];
    let placeholder = [...map.entries()].find(([, value]) => value === original)?.[0];
    if (!placeholder) {
      placeholder = `ssn_${placeholderSeq}`;
      placeholderSeq += 1;
      map.set(placeholder, original);
    }
    replacements.push({ start, end, placeholder });
    ssnMatch = SSN_PATTERN.exec(text);
  }

  replacements.sort((a, b) => b.start - a.start);
  for (const rep of replacements) {
    out = out.slice(0, rep.start) + rep.placeholder + out.slice(rep.end);
  }
  return out;
}

export function restorePlaceholdersInText(text: string, map: MaskPlaceholderMap): string {
  let out = text;
  for (const [placeholder, original] of map.entries()) {
    out = out.split(placeholder).join(original);
  }
  return out;
}
