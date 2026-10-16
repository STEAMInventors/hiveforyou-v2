import "server-only";

import type { CanonicalStudyReportAudience } from "@hiveforyou/shared/canonical-study-report-projection";
import {
  buildHiveWriterShadowRequestedEventId,
  HIVE_EVENT_WRITER_SHADOW_REQUESTED,
  hiveWriterShadowRequestedEventDataSchema,
} from "@hiveforyou/shared/events";

import { inngest } from "@/lib/inngest/client";

export async function emitWriterShadowRequestedEvent(input: {
  userId: string;
  caseId: string;
  studyRunId: string;
  audience: CanonicalStudyReportAudience;
  idempotencyKey: string;
}): Promise<void> {
  const data = hiveWriterShadowRequestedEventDataSchema.parse({
    userId: input.userId,
    caseId: input.caseId,
    studyRunId: input.studyRunId,
    audience: input.audience,
  });
  await inngest.send({
    id: buildHiveWriterShadowRequestedEventId({
      studyRunId: input.studyRunId,
      audience: input.audience,
      idempotencyKey: input.idempotencyKey,
    }),
    name: HIVE_EVENT_WRITER_SHADOW_REQUESTED,
    data,
  });
}