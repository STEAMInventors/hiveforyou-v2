import { z } from "zod";

/** Inngest application id shared by the Next.js app and the worker. */
export const HIVE_INNGEST_APP_ID = "hiveforyou";

export const HIVE_EVENT_PING = "hive/ping" as const;
export const HIVE_EVENT_INTAKE_REQUESTED = "hive/intake.requested" as const;
export const HIVE_EVENT_STUDY_REQUESTED = "hive/study.requested" as const;
export const HIVE_EVENT_DETERMINISTIC_CANONICAL_STUDY_BUILD =
  "hive/deterministic-canonical-study.build" as const;
export const HIVE_EVENT_WRITER_SHADOW_REQUESTED = "hive/writer-shadow.requested" as const;

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
  processingMode: z.enum(["canonical_openai_v4", "pack_driven_v1"]).optional(),
});

export type HiveStudyRequestedEventData = z.infer<typeof hiveStudyRequestedEventDataSchema>;

/** Deterministic Inngest event id for study queueing (dedupes double-clicks). */
export function buildStudyRequestedEventId(studyRunId: string): string {
  return `study:${studyRunId.trim()}`;
}

export const hiveDeterministicCanonicalStudyBuildEventDataSchema = z.object({
  userId: z.string().min(1),
  caseId: z.string().min(1),
  studyRunId: z.string().min(1),
});

export type HiveDeterministicCanonicalStudyBuildEventData = z.infer<
  typeof hiveDeterministicCanonicalStudyBuildEventDataSchema
>;

/** Dedupes repeat Build Hive clicks for the same study run. */
export function buildDeterministicCanonicalStudyBuildEventId(studyRunId: string): string {
  return `deterministic-canonical:${studyRunId.trim()}`;
}

export const hiveWriterShadowRequestedEventDataSchema = z.object({
  userId: z.string().min(1),
  caseId: z.string().min(1),
  studyRunId: z.string().min(1),
  audience: z.enum(["customer", "pro"]),
});

export type HiveWriterShadowRequestedEventData = z.infer<
  typeof hiveWriterShadowRequestedEventDataSchema
>;

/**
 * Dedupes Writer requests for the same study, audience, and projection/writer binding.
 * The worker recomputes the idempotency key from persisted data; this id only prevents
 * a second Inngest run for the same binding.
 */
export function buildHiveWriterShadowRequestedEventId(input: {
  studyRunId: string;
  audience: "customer" | "pro";
  idempotencyKey: string;
}): string {
  return `writer-shadow:${input.studyRunId.trim()}:${input.audience}:${input.idempotencyKey.trim()}`;
}

/** Deterministic Inngest event id for intake queueing (dedupes double-clicks). */
export function buildIntakeRequestedEventId(intakeRunId: string, appendSeq?: number): string {
  const trimmed = intakeRunId.trim();
  if (!appendSeq || appendSeq <= 0) {
    return `intake:${trimmed}`;
  }
  return `intake:${trimmed}:${appendSeq}`;
}
