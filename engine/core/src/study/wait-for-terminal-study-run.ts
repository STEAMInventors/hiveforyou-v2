import type { CanonicalStudyRun } from "@hiveforyou/shared/canonical-study";

import type { StudyRunRepository } from "./repositories";

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForTerminalStudyRun(
  runRepo: StudyRunRepository,
  caseId: string,
  idempotencyKey: string,
  options?: { timeoutMs?: number; pollMs?: number },
): Promise<CanonicalStudyRun | null> {
  const timeoutMs = options?.timeoutMs ?? 600_000;
  const pollMs = options?.pollMs ?? 150;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const run = await runRepo.getByIdempotencyKey(caseId, idempotencyKey);
    if (run && run.status !== "RUNNING") {
      return run;
    }
    await sleep(pollMs);
  }
  return null;
}
