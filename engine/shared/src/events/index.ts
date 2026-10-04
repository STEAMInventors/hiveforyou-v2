import { z } from "zod";

/** Inngest application id shared by the Next.js app and the worker. */
export const HIVE_INNGEST_APP_ID = "hiveforyou";

export const HIVE_EVENT_PING = "hive/ping" as const;
export const HIVE_EVENT_INTAKE_REQUESTED = "hive/intake.requested" as const;
export const HIVE_EVENT_STUDY_REQUESTED = "hive/study.requested" as const;

export const hiveRunEventDataSchema = z.object({
  userId: z.string().min(1),
  caseId: z.string().min(1),
  runId: z.string().min(1),
});

export type HiveRunEventData = z.infer<typeof hiveRunEventDataSchema>;

export const hivePingEventDataSchema = z.object({
  userId: z.string().min(1),
  nonce: z.string().min(1),
});

export type HivePingEventData = z.infer<typeof hivePingEventDataSchema>;

export const hiveIntakeRequestedEventDataSchema = hiveRunEventDataSchema;
export const hiveStudyRequestedEventDataSchema = hiveRunEventDataSchema;
