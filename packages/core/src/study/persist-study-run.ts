import type { CanonicalStudyRun } from "@hiveforyou/shared/canonical-study";

import type { StudyRunRepository } from "./repositories";

export type PersistStudyRunResult = {
  run: CanonicalStudyRun;
  /** Caller lost an insert race to an already in-progress run for this idempotency key. */
  joinedInProgress: boolean;
};

/** Persists a run and returns the canonical row identity from storage (idempotency-safe). */
export async function persistStudyRun(
  runRepo: StudyRunRepository,
  run: CanonicalStudyRun,
): Promise<PersistStudyRunResult> {
  const before = await runRepo.getByIdempotencyKey(run.caseId, run.idempotencyKey);
  const persisted = await runRepo.save(run);
  const joinedInProgress =
    before == null &&
    persisted.studyRunId !== run.studyRunId &&
    persisted.status === "RUNNING";
  return { run: persisted, joinedInProgress };
}
