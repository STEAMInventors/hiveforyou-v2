import type { HiveDiscoverRun } from "@hiveforyou/shared/discover";

import type { DiscoverRunRepository } from "./repositories";

/** Persists a run and returns the canonical row identity from storage (idempotency-safe). */
export async function persistDiscoverRun(
  runRepo: DiscoverRunRepository,
  run: HiveDiscoverRun,
): Promise<HiveDiscoverRun> {
  const persisted = await runRepo.save(run);
  const located = await runRepo.getByIdempotencyKey(run.caseId, run.idempotencyKey);
  if (located) {
    return {
      ...persisted,
      discoverRunId: located.discoverRunId,
      startedAt: located.startedAt,
    };
  }
  return persisted;
}
