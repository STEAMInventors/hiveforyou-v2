import { randomUUID } from "node:crypto";

import type { CanonicalStudyRun } from "@hiveforyou/shared/canonical-study";

/** Reuse the persisted run id whenever this case and idempotency key already have a row. */
export function resolveStudyRunIdForRetry(
  existing: CanonicalStudyRun | null,
  generateStudyRunId?: () => string,
): string {
  if (existing) {
    return existing.studyRunId;
  }
  return generateStudyRunId?.() ?? randomUUID();
}

export function resolveStudyRunStartedAt(
  existing: CanonicalStudyRun | null,
  studyRunId: string,
): string {
  if (existing?.studyRunId === studyRunId) {
    return existing.startedAt;
  }
  return new Date().toISOString();
}
