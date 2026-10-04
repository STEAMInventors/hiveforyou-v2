import type { PageQualityDecision, PageQualityMetrics } from "./contracts";

export interface QualityThresholds {
  readonly minMeaningfulCharacters: number;
  readonly minPrintableRatio: number;
  readonly maxGarbageRatio: number;
  readonly maxDuplicateTextRatio: number;
  readonly minCoverageWhenSparse: number;
  readonly sparseMeaningfulLimit: number;
}

export const DEFAULT_QUALITY_THRESHOLDS: QualityThresholds = {
  minMeaningfulCharacters: 40,
  minPrintableRatio: 0.72,
  maxGarbageRatio: 0.15,
  maxDuplicateTextRatio: 0.62,
  minCoverageWhenSparse: 0.03,
  sparseMeaningfulLimit: 120,
};

const PRINTABLE = /[\t\n\r\x20-\x7E\u00A1-\u024F\u0400-\u04FF\u2010-\u2027\u2030-\u205E]/;
const MEANINGFUL = /[A-Za-z0-9]/;
// eslint-disable-next-line no-control-regex -- measure extraction garbage, not user input
const GARBAGE = /[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export function computePageQualityMetrics(input: {
  readonly rawText: string;
  readonly textItemCount: number;
  readonly estimatedCoverage: number;
  readonly imageOperatorCount: number;
}): PageQualityMetrics {
  const { rawText, textItemCount, estimatedCoverage, imageOperatorCount } = input;
  const characterCount = rawText.length;
  let meaningful = 0;
  let printable = 0;
  let garbage = 0;
  for (const char of rawText) {
    if (MEANINGFUL.test(char)) meaningful += 1;
    if (PRINTABLE.test(char)) printable += 1;
    if (GARBAGE.test(char)) garbage += 1;
  }
  return {
    characterCount,
    meaningfulCharacterCount: meaningful,
    printableRatio: characterCount === 0 ? 0 : printable / characterCount,
    garbageRatio: characterCount === 0 ? 0 : garbage / characterCount,
    duplicateTextRatio: duplicateRatio(rawText),
    textItemCount,
    estimatedCoverage,
    imageOperatorCount,
  };
}

export function decideNativeVsOcr(
  metrics: PageQualityMetrics,
  thresholds: QualityThresholds = DEFAULT_QUALITY_THRESHOLDS,
): PageQualityDecision {
  const reasons: string[] = [];

  const imageCount = metrics.imageOperatorCount ?? 0;
  if (metrics.characterCount === 0 && imageCount === 0) {
    return { useOcr: false, reasons: ["empty-page-no-images"], metrics };
  }
  if (metrics.characterCount === 0 && imageCount > 0) {
    reasons.push("empty-native-text-with-images");
  }
  if (
    metrics.meaningfulCharacterCount < thresholds.minMeaningfulCharacters &&
    imageCount > 0
  ) {
    reasons.push("low-meaningful-character-count");
  }
  if (metrics.characterCount > 0 && metrics.printableRatio < thresholds.minPrintableRatio) {
    reasons.push("low-printable-ratio");
  }
  if (metrics.garbageRatio > thresholds.maxGarbageRatio) {
    reasons.push("high-garbage-ratio");
  }
  if (
    metrics.duplicateTextRatio > thresholds.maxDuplicateTextRatio &&
    metrics.meaningfulCharacterCount < 200
  ) {
    reasons.push("high-duplicate-text-ratio");
  }
  if (
    metrics.estimatedCoverage < thresholds.minCoverageWhenSparse &&
    metrics.meaningfulCharacterCount < thresholds.sparseMeaningfulLimit &&
    imageCount > 0
  ) {
    reasons.push("sparse-text-coverage-over-images");
  }

  const useOcr = reasons.length > 0;
  return {
    useOcr,
    reasons: useOcr ? reasons : ["native-quality-adequate"],
    metrics,
  };
}

export function countMeaningfulCharacters(text: string): number {
  let meaningful = 0;
  for (const char of text) {
    if (MEANINGFUL.test(char)) {
      meaningful += 1;
    }
  }
  return meaningful;
}

/** P1: skip getOperatorList when image ops cannot affect the gate outcome. */
export function canSkipOperatorList(
  meaningfulCharacterCount: number,
  thresholds: QualityThresholds = DEFAULT_QUALITY_THRESHOLDS,
): boolean {
  return (
    meaningfulCharacterCount >= thresholds.minMeaningfulCharacters &&
    meaningfulCharacterCount >= thresholds.sparseMeaningfulLimit
  );
}

export const GARBAGE_OCR_REASONS = new Set([
  "high-garbage-ratio",
  "low-printable-ratio",
  "high-duplicate-text-ratio",
]);

export function isGarbageOcrReasons(reasons: readonly string[]): boolean {
  return reasons.some((reason) => GARBAGE_OCR_REASONS.has(reason));
}

function duplicateRatio(text: string): number {
  const tokens = text
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 2);
  if (tokens.length < 8) {
    return 0;
  }
  const unique = new Set(tokens);
  return 1 - unique.size / tokens.length;
}
