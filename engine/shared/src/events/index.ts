import { z } from "zod";

/** Inngest application id shared by the Next.js app and the worker. */
export const HIVE_INNGEST_APP_ID = "hiveforyou";

export const HIVE_EVENT_PING = "hive/ping" as const;
export const HIVE_EVENT_INTAKE_REQUESTED = "hive/intake.requested" as const;
export const HIVE_EVENT_STUDY_REQUESTED = "hive/study.requested" as const;

export const hivePingEventDataSchema = z.object({
  userId: z.string().min(1),
  nonce: z.string().min(1),
});

export type HivePingEventData = z.infer<typeof hivePingEventDataSchema>;

export const hiveIntakeRequestedEventDataSchema = z.object({
  userId: z.string().min(1),
  caseId: z.string().min(1),
  intakeRunId: z.string().min(1),
});

export type HiveIntakeRequestedEventData = z.infer<typeof hiveIntakeRequestedEventDataSchema>;

export const hiveStudyRequestedEventDataSchema = z.object({
  userId: z.string().min(1),
  caseId: z.string().min(1),
  intakeRunId: z.string().min(1),
  studyRunId: z.string().min(1),
});

export type HiveStudyRequestedEventData = z.infer<typeof hiveStudyRequestedEventDataSchema>;

/** Deterministic Inngest event id for study queueing (dedupes double-clicks). */
export function buildStudyRequestedEventId(studyRunId: string): string {
  return `study:${studyRunId.trim()}`;
}

/** Deterministic Inngest event id for intake queueing (dedupes double-clicks). */
export function buildIntakeRequestedEventId(intakeRunId: string, appendSeq?: number): string {
  const trimmed = intakeRunId.trim();
  if (!appendSeq || appendSeq <= 0) {
    return `intake:${trimmed}`;
  }
  return `intake:${trimmed}:${appendSeq}`;
}
