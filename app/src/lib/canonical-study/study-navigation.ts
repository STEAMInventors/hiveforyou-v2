import type { QuestionsAnswerSnapshot } from "@/lib/questions/types";

const PENDING_SNAPSHOT_KEY = "hive-pending-study-snapshot";

export function stashStudySnapshot(snapshot: QuestionsAnswerSnapshot): void {
  window.sessionStorage.setItem(PENDING_SNAPSHOT_KEY, JSON.stringify(snapshot));
}

export function consumeStashedStudySnapshot(): QuestionsAnswerSnapshot | null {
  const raw = window.sessionStorage.getItem(PENDING_SNAPSHOT_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as QuestionsAnswerSnapshot;
  } catch {
    return null;
  }
}

export const STUDY_ROUTE = "/study";
