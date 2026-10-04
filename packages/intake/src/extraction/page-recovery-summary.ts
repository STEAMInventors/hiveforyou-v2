import type { NestIepRecoveredPage, UnreadablePageRange } from "@hiveforyou/shared/intake";

function isImageWithoutText(page: NestIepRecoveredPage): boolean {
  if (page.canonicalText.trim().length > 0) {
    return false;
  }
  const reasons = page.qualityDecision?.reasons ?? [];
  if (reasons.includes("empty-native-text-with-images")) {
    return true;
  }
  const images = page.qualityDecision?.metrics.imageOperatorCount;
  return typeof images === "number" && images > 0;
}

/** Blank pages stay readable. Unreadable means a scan with no text, or a corrupted page. */
export function isPageUnreadable(page: NestIepRecoveredPage): boolean {
  if (page.sourceIssues.some((issue) => issue.code === "CORRUPTED_PAGE")) {
    return true;
  }
  return isImageWithoutText(page);
}

export function unreadablePageNumbers(pages: readonly NestIepRecoveredPage[]): number[] {
  const numbers: number[] = [];
  for (const page of pages) {
    if (isPageUnreadable(page)) {
      numbers.push(page.pageNumber);
    }
  }
  return numbers.sort((a, b) => a - b);
}

export function compressPageRanges(pageNumbers: readonly number[]): UnreadablePageRange[] {
  if (pageNumbers.length === 0) {
    return [];
  }
  const ranges: UnreadablePageRange[] = [];
  let start = pageNumbers[0]!;
  let end = start;
  for (let i = 1; i < pageNumbers.length; i += 1) {
    const n = pageNumbers[i]!;
    if (n === end + 1) {
      end = n;
      continue;
    }
    ranges.push({ start, end });
    start = n;
    end = n;
  }
  ranges.push({ start, end });
  return ranges;
}
