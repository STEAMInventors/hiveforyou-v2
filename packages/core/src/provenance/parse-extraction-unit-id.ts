export type ParsedExtractionUnitId =
  | { kind: "line"; order: number }
  | { kind: "block"; index: number };

/**
 * Stable locators for normalized extraction units.
 * Formats: `line:{order}` | `block:{index}` (0-based block index on page).
 */
export function parseExtractionUnitId(extractionId: string): ParsedExtractionUnitId | null {
  const trimmed = extractionId.trim();
  const lineMatch = /^line:(\d+)$/.exec(trimmed);
  if (lineMatch) {
    const order = Number(lineMatch[1]);
    if (Number.isInteger(order) && order >= 0) {
      return { kind: "line", order };
    }
    return null;
  }
  const blockMatch = /^block:(\d+)$/.exec(trimmed);
  if (blockMatch) {
    const index = Number(blockMatch[1]);
    if (Number.isInteger(index) && index >= 0) {
      return { kind: "block", index };
    }
    return null;
  }
  return null;
}
