/**
 * T0.2 baselines were recorded under fixture ids (caleb9) while certified goldens use l002.
 */
const GOLDEN_TO_BASELINE_CASE_ID: Readonly<Record<string, string>> = {
  l002: "caleb9",
};

export function baselineCaseIdForGolden(goldenCaseId: string): string {
  return GOLDEN_TO_BASELINE_CASE_ID[goldenCaseId] ?? goldenCaseId;
}

export function baselineManifestDirForGolden(goldenCaseId: string): string {
  return baselineCaseIdForGolden(goldenCaseId);
}
