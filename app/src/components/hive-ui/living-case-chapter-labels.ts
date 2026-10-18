import type { HiveUiLivingCaseChapterKey } from "@hiveforyou/shared/hive-ui-tree";

export const LIVING_CASE_CHAPTER_LABELS: Record<HiveUiLivingCaseChapterKey, string> = {
  understand: "Understand",
  discover: "Discover",
  act: "Act",
  verify: "Verify",
};

export const LIVING_CASE_CHAPTER_ORDER: HiveUiLivingCaseChapterKey[] = [
  "understand",
  "discover",
  "act",
  "verify",
];
