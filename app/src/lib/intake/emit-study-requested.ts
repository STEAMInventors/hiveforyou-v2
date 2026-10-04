import "server-only";

import {
  buildStudyRequestedEventId,
  HIVE_EVENT_STUDY_REQUESTED,
  hiveStudyRequestedEventDataSchema,
} from "@hiveforyou/shared/events";
import { isTerminalStudyRunStatus } from "@hiveforyou/shared/canonical-study";
import type { CanonicalStudyRun } from "@hiveforyou/shared/canonical-study";

import { inngest } from "@/lib/inngest/client";

export async function emitStudyRequestedEvent(
  run: CanonicalStudyRun,
  userId: string,
): Promise<void> {
  if (isTerminalStudyRunStatus(run.status)) {
    return;
  }
  const intakeRunId = run.intakeRunId?.trim();
  if (!intakeRunId) {
    throw new Error("STUDY_INTAKE_RUN_REQUIRED");
  }
  const data = hiveStudyRequestedEventDataSchema.parse({
    userId,
    caseId: run.caseId,
    intakeRunId,
    studyRunId: run.studyRunId,
  });
  await inngest.send({
    id: buildStudyRequestedEventId(run.studyRunId),
    name: HIVE_EVENT_STUDY_REQUESTED,
    data,
  });
}
