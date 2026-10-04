import type { NestIepRecoveredPage } from "@hiveforyou/shared/intake";
import type { ResolvedEvidenceRegion } from "@hiveforyou/shared/projections";

export type SnippetLocateIssue = "SNIPPET_NOT_FOUND" | "SNIPPET_AMBIGUOUS";

export type SnippetLocateResult =
  | {
      ok: true;
      start: number;
      end: number;
      matchedText: string;
      region?: ResolvedEvidenceRegion;
      lineOrder?: number;
    }
  | { ok: false; issue: SnippetLocateIssue };

function regionFromBBox(
  box: { x: number; y: number; width: number; height: number } | undefined,
): ResolvedEvidenceRegion | undefined {
  if (!box) {
    return undefined;
  }
  if (
    !Number.isFinite(box.x) ||
    !Number.isFinite(box.y) ||
    !Number.isFinite(box.width) ||
    !Number.isFinite(box.height) ||
    box.width <= 0 ||
    box.height <= 0
  ) {
    return undefined;
  }
  return {
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    coordinateSpace: "source-document-page",
  };
}

function lineForOffset(page: NestIepRecoveredPage, offset: number) {
  return (
    page.lines.find((line) => offset >= line.startOffset && offset < line.endOffset) ??
    page.lines.find((line) => offset <= line.startOffset) ??
    page.lines[0]
  );
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let pos = 0;
  while (pos <= haystack.length) {
    const index = haystack.indexOf(needle, pos);
    if (index < 0) {
      break;
    }
    count += 1;
    if (count > 1) {
      return count;
    }
    pos = index + Math.max(1, needle.length);
  }
  return count;
}

function countRegexMatches(haystack: string, pattern: RegExp): number {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const re = new RegExp(pattern.source, flags);
  let count = 0;
  while (re.exec(haystack) !== null) {
    count += 1;
    if (count > 1) {
      break;
    }
  }
  return count;
}

/**
 * Map a claim snippet to canonical page offsets and line geometry (deterministic, no LLM).
 */
export function locateSnippetInPage(
  page: NestIepRecoveredPage,
  snippet: string,
): SnippetLocateResult {
  const needle = snippet.trim();
  if (!needle || needle.length < 4) {
    return { ok: false, issue: "SNIPPET_NOT_FOUND" };
  }
  const hay = page.canonicalText;

  if (countOccurrences(hay, needle) > 1) {
    return { ok: false, issue: "SNIPPET_AMBIGUOUS" };
  }

  const exactIndex = hay.indexOf(needle);
  if (exactIndex >= 0) {
    return finish(page, exactIndex, exactIndex + needle.length, needle);
  }

  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const flexible = new RegExp(escaped.replace(/\s+/g, "\\s+"), "i");
  if (countRegexMatches(hay, flexible) > 1) {
    return { ok: false, issue: "SNIPPET_AMBIGUOUS" };
  }
  const match = flexible.exec(hay);
  if (match && match.index !== undefined) {
    const matchedText = match[0];
    return finish(page, match.index, match.index + matchedText.length, matchedText);
  }

  return { ok: false, issue: "SNIPPET_NOT_FOUND" };
}

function finish(
  page: NestIepRecoveredPage,
  start: number,
  end: number,
  matchedText: string,
): SnippetLocateResult {
  const line = lineForOffset(page, start);
  return {
    ok: true,
    start,
    end,
    matchedText,
    region: regionFromBBox(line?.boundingBox),
    lineOrder: line?.order,
  };
}
