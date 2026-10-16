import { describe, expect, it } from "vitest";

import type { HiveWriterShadowRecord } from "@hiveforyou/shared/hive-writer-proposal";

import {
  appendTerminalAttemptSnapshot,
  canRetryTerminalWriterShadowFailure,
  isRetriableTerminalWriterShadowFailure,
} from "./writer-shadow-retry.js";

function failedRecord(errorCodes: string[]): HiveWriterShadowRecord {
  return {
    schemaVersion: "hive-writer-shadow-record/1",
    idempotencyKey: "a".repeat(64),
    caseId: "case-1",
    studyRunId: "run-1",
    audience: "customer",
    status: "failed",
    observability: {
      studyRunId: "run-1",
      audience: "customer",
      projectionHash: "b".repeat(64),
      catalogVersion: "1",
      writerImplementationVersion: "1",
      proposalSchemaVersion: "hive-writer-proposal/1",
      modelIdentifier: null,
      durationMs: 1,
      tokenUsage: null,
    },
    validation: { ok: false, errorCodes, message: "failed" },
    proposal: null,
    hiveUiTree: null,
  };
}

describe("writer-shadow-retry", () => {
  it("allows one retry for retriable terminal failures", () => {
    const record = failedRecord(["WRITER_MODEL_OUTPUT_TRUNCATED"]);
    expect(isRetriableTerminalWriterShadowFailure(record)).toBe(true);
    expect(canRetryTerminalWriterShadowFailure({ record, attemptHistory: null })).toBe(true);
    const history = appendTerminalAttemptSnapshot({ history: null, record });
    expect(canRetryTerminalWriterShadowFailure({ record, attemptHistory: history })).toBe(false);
  });

  it("allows one retry for legacy WRITER_VALIDATION_FAILED rows with HTTP 422 JSON-invalid detail", () => {
    const record = failedRecord(["WRITER_VALIDATION_FAILED"]);
    record.validation.message =
      'WRITER_HTTP_422:{"detail":{"error":{"code":"WRITER_MODEL_JSON_INVALID","message":"WRITER_MODEL_JSON_INVALID"}}}';
    expect(isRetriableTerminalWriterShadowFailure(record)).toBe(true);
    expect(canRetryTerminalWriterShadowFailure({ record, attemptHistory: null })).toBe(true);
  });

  it("does not retry generic WRITER_VALIDATION_FAILED without JSON-invalid HTTP detail", () => {
    const record = failedRecord(["WRITER_VALIDATION_FAILED"]);
    record.validation.message = "Writer validation failed.";
    expect(isRetriableTerminalWriterShadowFailure(record)).toBe(false);
  });

  it("does not retry accepted or non-retriable failures", () => {
    const rejected = { ...failedRecord(["HIVE_UI_TREE_INVALID"]), status: "rejected" as const };
    expect(isRetriableTerminalWriterShadowFailure(rejected)).toBe(false);
    expect(
      canRetryTerminalWriterShadowFailure({
        record: failedRecord(["WRITER_PROVIDER_SCHEMA_UNSUPPORTED"]),
        attemptHistory: null,
      }),
    ).toBe(false);
  });
});