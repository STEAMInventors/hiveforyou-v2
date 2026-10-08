import type { ClaimModality, ClaimValueV4, MissingGapKind } from "@hiveforyou/shared/case-intelligence/4";

export const GOLDEN_SPLITS = ["tune", "holdout", "tripwire"] as const;
export type GoldenSplit = (typeof GOLDEN_SPLITS)[number];

/** Half-open page word index range `[start, end)` aligned with `PageWordRange` in core. */
export type GoldenWordRange = [start: number, end: number];

export type GoldenFactValueKind = ClaimValueV4["kind"];

/** Normalized fact value payload (matches v4 claim value shapes). */
export type GoldenFactValue = ClaimValueV4;

export type GoldenFact = {
  id: string;
  documentId: string;
  pageNumber: number;
  wordRange: GoldenWordRange;
  valueKind: GoldenFactValueKind;
  value: GoldenFactValue;
  acceptableModalities: ClaimModality[];
};

export type GoldenGap = {
  id: string;
  gapKind: MissingGapKind;
  description: string;
  labelWordRange?: GoldenWordRange;
};

/** Declarative negative control: the grader must not treat this as an accepted claim (T1.3). */
export type GoldenTripwire = {
  id: string;
  mustNotClaim: string;
  description?: string;
};

type GoldenCaseFields = {
  caseId: string;
  split: GoldenSplit;
  /** Repo-relative fixture directory, e.g. `engine/intake/fixtures/l001`. */
  corpusDir: string;
  facts: GoldenFact[];
  gaps: GoldenGap[];
  tripwires: GoldenTripwire[];
};

/** Human-reviewed golden; `verifiedBy` must be a non-empty reviewer id or name. */
export type CertifiedGoldenCase = GoldenCaseFields & {
  verifiedBy: string;
  draft?: false;
};

/** Machine-generated seed for review; must not impersonate human verification. */
export type DraftGoldenCase = GoldenCaseFields & {
  verifiedBy: null;
  draft: true;
};

export type GoldenCase = CertifiedGoldenCase | DraftGoldenCase;

export function isDraftGoldenCase(value: GoldenCase): value is DraftGoldenCase {
  return value.verifiedBy === null && value.draft === true;
}

export function isCertifiedGoldenCase(value: GoldenCase): value is CertifiedGoldenCase {
  return typeof value.verifiedBy === "string" && value.verifiedBy.trim().length > 0;
}
