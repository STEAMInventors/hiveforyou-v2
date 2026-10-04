import "server-only";

import {
  buildIntakeRequestedEventId,
  HIVE_EVENT_INTAKE_REQUESTED,
  hiveIntakeRequestedEventDataSchema,
} from "@hiveforyou/shared/events";
import { isTerminalIntakeRunStatus } from "@hiveforyou/shared/intake";
import type { IntakeRunRecord } from "@hiveforyou/intake";

import { inngest } from "@/lib/inngest/client";

export async function emitIntakeRequestedEvent(run: IntakeRunRecord): Promise<void> {
  if (isTerminalIntakeRunStatus(run.status)) {
    return;
  }
  const eventId =
    run.intakeQueueSeq > 0
      ? buildIntakeRequestedEventId(run.id, run.intakeQueueSeq)
      : buildIntakeRequestedEventId(run.id);
  const data = hiveIntakeRequestedEventDataSchema.parse({
    userId: run.userId,
    caseId: run.caseId,
    intakeRunId: run.id,
  });
  await inngest.send({
    id: eventId,
    name: HIVE_EVENT_INTAKE_REQUESTED,
    data,
  });
}
