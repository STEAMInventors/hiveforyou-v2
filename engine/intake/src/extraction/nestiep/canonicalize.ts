const NBSP = /\u00a0/g;
const REPLACEMENT = /\uFFFD/g;
// Extraction artifacts only; not a privacy or security filter.
// eslint-disable-next-line no-control-regex -- strip non-printable extraction noise
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function canonicalizeLine(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(NBSP, " ")
    .replace(REPLACEMENT, "")
    .replace(CONTROL, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function canonicalizePageText(lines: readonly string[]): string {
  const normalized = lines.map((line) => canonicalizeLine(line)).filter((line) => line.length > 0);
  return normalized.join("\n").replace(/\n{3,}/g, "\n\n");
}

export function sliceCanonicalText(canonicalText: string, startOffset: number, endOffset: number): string {
  return canonicalText.slice(startOffset, endOffset);
}
