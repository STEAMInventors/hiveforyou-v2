import { isTerminalStudyRunStatus } from "@hiveforyou/shared/canonical-study";

import { createStudyRunEvent, type StudyRunEventRepository } from "./event-repository";
import type { StudyRunRepository } from "./repositories";

export async function markStudyRunWorkerFailed(
  runRepo: StudyRunRepository,
  eventRepo: StudyRunEventRepository,
  input: { userId: string; studyRunId: string; errorCode: string },
): Promise<void> {
  const run = await runRepo.getByStudyRunId(input.studyRunId);
  if (!run || isTerminalStudyRunStatus(run.status)) {
    return;
  }
  const completedAt = new Date().toISOString();
  await runRepo.save({
    ...run,
    status: "FAILED",
    errorCode: "STUDY_WORKER_FAILED",
    errorMessage: input.errorCode,
    completedAt,
  });
  await eventRepo.append(
    createStudyRunEvent("study_run.failed", input.studyRunId, run.caseId, {
      errorCode: "STUDY_WORKER_FAILED",
    }),
  );
  await eventRepo.append(
    createStudyRunEvent("study_run.completed", input.studyRunId, run.caseId, {
      status: "FAILED",
    }),
  );
}
