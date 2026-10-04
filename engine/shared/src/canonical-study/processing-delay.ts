import type { StudyRunStatus } from "./run";

export const STUDY_QUEUED_DELAY_MS = 5 * 60 * 1000;

const TERMINAL_STUDY_RUN_STATUSES = new Set<StudyRunStatus>([
  "SUCCEEDED",
  "NEEDS_REVIEW",
  "FAILED",
]);

export function isTerminalStudyRunStatus(status: StudyRunStatus): boolean {
  return TERMINAL_STUDY_RUN_STATUSES.has(status);
}

export function isStudyRunProcessing(status: StudyRunStatus): boolean {
  return status === "QUEUED" || status === "RUNNING";
}

/** True when a worker-queued study has waited longer than expected without starting. */
export function isStudyProcessingDelayed(
  status: StudyRunStatus,
  startedAt: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (status !== "QUEUED" || !startedAt?.trim()) {
    return false;
  }
  const started = Date.parse(startedAt);
  if (!Number.isFinite(started)) {
    return false;
  }
  return nowMs - started > STUDY_QUEUED_DELAY_MS;
}
