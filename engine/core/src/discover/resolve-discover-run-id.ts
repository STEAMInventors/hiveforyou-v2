import { randomUUID } from "node:crypto";

import type { HiveDiscoverRun } from "@hiveforyou/shared/discover";

/** Reuse the persisted run id whenever this case and idempotency key already have a row. */
export function resolveDiscoverRunIdForRetry(
  existing: HiveDiscoverRun | null,
  generateDiscoverRunId?: () => string,
): string {
  if (existing) {
    return existing.discoverRunId;
  }
  return generateDiscoverRunId?.() ?? randomUUID();
}

export function resolveDiscoverRunStartedAt(
  existing: HiveDiscoverRun | null,
  discoverRunId: string,
): string {
  if (existing?.discoverRunId === discoverRunId) {
    return existing.startedAt;
  }
  return new Date().toISOString();
}
