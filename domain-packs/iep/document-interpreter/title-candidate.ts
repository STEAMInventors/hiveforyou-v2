import type { ScanDocument, ScanPage } from "./contracts";

const KNOWN_TITLE =
  /\b(referral|evaluation plan|assessment plan|parent(?:al)? evaluation consent|consent to eval|consent for (?:an? )?(?:initial )?eval|permission to evaluate|psychoeducational|psycho-educational|psychological evaluation|academic evaluation|speech[-\s]?language|eligibility determination|individualized education program|\biep\b|prior written notice|\bpwn\b|progress report)\b/i;

/**
 * Extract a short title candidate from the first page for classification.
 * Prefer short title-like lines; never invent from the filename alone.
 */
export function extractTitleCandidate(document: ScanDocument): string | null {
  const page1 = document.pages.find((page) => page.pageNumber === 1) ?? document.pages[0];
  if (!page1?.text?.trim()) return null;
  return titleFromPageText(page1.text);
}

export function titleFromPageText(text: string): string | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);

  if (!lines.length) {
    const compact = text.replace(/\s+/g, " ").trim().slice(0, 200);
    return compact || null;
  }

  const scored = lines
    .map((line) => ({ line: line.slice(0, 160), score: scoreTitleLine(line) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < 1) {
    return lines.slice(0, 3).join(" ").slice(0, 200) || null;
  }
  return best.line;
}

function scoreTitleLine(line: string): number {
  let score = 0;
  const len = line.length;
  if (len >= 8 && len <= 90) score += 2;
  else if (len <= 120) score += 1;
  if (KNOWN_TITLE.test(line)) score += 5;
  if (/\bindividualized education (?:program|plan)\b|\breevaluation\s+iep\b|\binitial\s+iep\b|\bdraft\s+iep\b/i.test(line)) {
    score += 4;
  }
  if (/^[A-Z0-9][A-Z0-9\s\-:/&()]{6,}$/.test(line)) score += 2;
  if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,8}$/.test(line)) score += 2;
  if (/page\s*\d+|confidential|student name|dob\b|date of birth/i.test(line)) score -= 3;
  return score;
}

export function isTitleAmbiguous(titleCandidate: string | null): boolean {
  if (!titleCandidate?.trim()) return true;
  return !KNOWN_TITLE.test(titleCandidate);
}

/** Pages to send to the classifier LLM: page 1 always; 2–3 when title is ambiguous or local is weak. */
export function pagesForClassification(
  pages: ScanPage[],
  opts: { titleCandidate: string | null; expandEarlyPages: boolean }
): ScanPage[] {
  if (!pages.length) return [];
  const sorted = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  if (!opts.expandEarlyPages && opts.titleCandidate && !isTitleAmbiguous(opts.titleCandidate)) {
    return sorted.slice(0, 1);
  }
  return sorted.slice(0, 3);
}
