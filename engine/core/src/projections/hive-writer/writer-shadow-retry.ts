import type { HiveWriterShadowRecord } from "@hiveforyou/shared/hive-writer-proposal";

export const HIVE_WRITER_SHADOW_ATTEMPT_HISTORY_SCHEMA_VERSION = "hive-writer-shadow-attempt-history/1" as const;

export type HiveWriterShadowAttemptHistory = {
  schemaVersion: typeof HIVE_WRITER_SHADOW_ATTEMPT_HISTORY_SCHEMA_VERSION;
  idempotencyKey: string;
  studyRunId: string;
  audience: HiveWriterShadowRecord["audience"];
  attempts: Array<{
    savedAt: string;
    status: HiveWriterShadowRecord["status"];
    errorCodes: string[];
    observability: HiveWriterShadowRecord["observability"];
  }>;
};

export const RETRIABLE_TERMINAL_WRITER_SHADOW_ERROR_CODES = new Set([
  "WRITER_MODEL_JSON_INVALID",
  "WRITER_MODEL_JSON_MALFORMED",
  "WRITER_MODEL_OUTPUT_TRUNCATED",
  "WRITER_MODEL_OUTPUT_EMPTY",
  "WRITER_PROVIDER_HTTP_5XX",
  "WRITER_PROVIDER_HTTP_TIMEOUT",
  "WRITER_PROVIDER_CALL_FAILED",
]);

function isLegacyWriterHttpJsonInvalidFailure(record: HiveWriterShadowRecord): boolean {
  if (!record.validation.errorCodes.includes("WRITER_VALIDATION_FAILED")) {
    return false;
  }
  const message = record.validation.message ?? "";
  if (!message.includes("WRITER_HTTP_422")) {
    return false;
  }
  return (
    message.includes("WRITER_MODEL_JSON_INVALID") || message.includes("WRITER_MODEL_JSON_MALFORMED")
  );
}

export function isRetriableTerminalWriterShadowFailure(record: HiveWriterShadowRecord): boolean {
  if (record.status !== "failed") {
    return false;
  }
  if (record.validation.errorCodes.some((code) => RETRIABLE_TERMINAL_WRITER_SHADOW_ERROR_CODES.has(code))) {
    return true;
  }
  return isLegacyWriterHttpJsonInvalidFailure(record);
}

export function canRetryTerminalWriterShadowFailure(input: {
  record: HiveWriterShadowRecord;
  attemptHistory: HiveWriterShadowAttemptHistory | null;
}): boolean {
  if (!isRetriableTerminalWriterShadowFailure(input.record)) {
    return false;
  }
  const priorAttempts = input.attemptHistory?.attempts.length ?? 0;
  return priorAttempts < 1;
}

export function appendTerminalAttemptSnapshot(input: {
  history: HiveWriterShadowAttemptHistory | null;
  record: HiveWriterShadowRecord;
  now?: () => number;
}): HiveWriterShadowAttemptHistory {
  const now = input.now ?? (() => Date.now());
  const base: HiveWriterShadowAttemptHistory = input.history ?? {
    schemaVersion: HIVE_WRITER_SHADOW_ATTEMPT_HISTORY_SCHEMA_VERSION,
    idempotencyKey: input.record.idempotencyKey,
    studyRunId: input.record.studyRunId,
    audience: input.record.audience,
    attempts: [],
  };
  return {
    ...base,
    attempts: [
      ...base.attempts,
      {
        savedAt: new Date(now()).toISOString(),
        status: input.record.status,
        errorCodes: [...input.record.validation.errorCodes],
        observability: { ...input.record.observability },
      },
    ],
  };
}
