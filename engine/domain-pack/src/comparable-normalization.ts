import type { ProposalDomainPack } from "./pack-driven-reader/types.js";
import {
  applyFieldSynonymNormalization,
  normalizeSynonymToken,
  parseFieldSynonyms,
} from "./pack-driven-reader/field-synonyms.js";

export type ComparableNormalizeStep = "lowercase" | "trim_punctuation" | "vocabulary_synonyms";

/** Default steps for join keys and semantic comparisons (pack synonyms are field-scoped). */
export const DEFAULT_COMPARABLE_NORMALIZE_STEPS: readonly ComparableNormalizeStep[] = [
  "lowercase",
  "trim_punctuation",
  "vocabulary_synonyms",
];

export function applyComparableNormalizeSteps(
  text: string,
  steps: readonly ComparableNormalizeStep[] | undefined,
  pack: ProposalDomainPack,
  fieldPath?: string,
): string {
  let result = text.trim();
  for (const step of steps ?? DEFAULT_COMPARABLE_NORMALIZE_STEPS) {
    if (step === "lowercase") {
      result = result.toLowerCase();
    } else if (step === "trim_punctuation") {
      result = result.replace(/[^\w\s/-]+/g, " ").replace(/\s+/g, " ").trim();
    } else if (step === "vocabulary_synonyms") {
      const entries = parseFieldSynonyms(pack.vocabulary?.fieldSynonyms);
      result = applyFieldSynonymNormalization(result, entries, fieldPath);
    }
  }
  return result;
}

export function normalizeComparableFieldText(input: {
  pack: ProposalDomainPack;
  recordTypeId: string;
  fieldId: string;
  text: string;
  constructNormalizeSteps?: readonly ComparableNormalizeStep[];
}): string {
  const fieldPath = `${input.recordTypeId}.${input.fieldId}`;
  const steps = input.constructNormalizeSteps ?? DEFAULT_COMPARABLE_NORMALIZE_STEPS;
  return applyComparableNormalizeSteps(normalizeSynonymToken(input.text), steps, input.pack, fieldPath);
}

export const CLASSIFICATION_STATES = ["yes", "no", "unclear"] as const;
export type ClassificationState = (typeof CLASSIFICATION_STATES)[number];

export function isClassificationValueKind(valueKind: string | undefined): boolean {
  return valueKind === "classification";
}

/** Verified positive classification for insight operands (default positive state: yes). */
export function isVerifiedPositiveClassification(
  enumValues: readonly string[] | undefined,
  normalizedValue: unknown,
  positiveState = "yes",
): boolean {
  if (!enumValues?.length || !isClassificationEnum(enumValues)) {
    return String(normalizedValue ?? "").toLowerCase() === positiveState;
  }
  return String(normalizedValue ?? "").toLowerCase() === positiveState;
}

export function isClassificationEnum(enumValues: readonly string[]): boolean {
  const set = new Set(enumValues.map((v) => v.toLowerCase()));
  return CLASSIFICATION_STATES.every((state) => set.has(state));
}
