import { describe, expect, it, vi } from "vitest";

import type { CanonicalStudyRun } from "@hiveforyou/shared/canonical-study";

import {
  AgentRunTraceConflictError,
  AgentRunTraceRepository,
  AgentRunTraceValidationError,
  assertBoundedTracePayload,
  validateAgentRunTraceEvent,
  type AgentRunTraceEventInput,
} from "./agent-run-trace.js";
import type { HiveGateway, HiveRow } from "./hive-gateway.js";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const CASE_A = "44444444-4444-4444-8444-444444444444";
const STUDY_RUN_A = "33333333-3333-4333-8333-333333333333";
const ATTEMPT_A = "55555555-5555-4555-8555-555555555555";
const ATTEMPT_B = "66666666-6666-4666-8666-666666666666";

function sampleEvent(overrides: Partial<AgentRunTraceEventInput> = {}): AgentRunTraceEventInput {
  return {
    id: "77777777-7777-4777-8777-777777777777",
    studyRunId: STUDY_RUN_A,
    attemptId: ATTEMPT_A,
    sequenceNumber: 0,
    caseId: CASE_A,
    userId: USER_A,
    eventType: "STARTED",
    occurredAt: "2026-10-09T12:00:00.000Z",
    domainId: "iep",
    domainPackId: "iep",
    domainPackVersion: "1",
    modelId: "claude-test",
    sourceDocumentIds: ["doc-a"],
    payload: { modelId: "claude-test" },
    ...overrides,
  };
}

function mockGateway(seed?: { studyRun?: HiveRow; caseRow?: HiveRow }) {
  const traceRows: HiveRow[] = [];
  const studyRuns: HiveRow[] = seed?.studyRun ? [seed.studyRun] : [];
  const cases: HiveRow[] = seed?.caseRow ? [seed.caseRow] : [];

  const gateway: HiveGateway = {
    async insert(table, row) {
      if (table === "agent_run_trace_events") {
        const duplicate = traceRows.some(
          (existing) =>
            existing.id === row.id ||
            (existing.attempt_id === row.attempt_id &&
              existing.sequence_number === row.sequence_number),
        );
        if (duplicate) {
          throw new Error('duplicate key value violates unique constraint "agent_run_trace_events_attempt_id_sequence_number_key"');
        }
        traceRows.push({ ...row });
        return;
      }
      throw new Error(`unexpected insert ${table}`);
    },
    async upsert() {
      throw new Error("unused");
    },
    async updateWhere() {
      throw new Error("unused");
    },
    async selectWhere(table, where) {
      if (table === "study_runs") {
        return studyRuns.filter((row) =>
          Object.entries(where).every(([key, value]) => row[key] === value),
        );
      }
      if (table === "cases") {
        return cases.filter((row) =>
          Object.entries(where).every(([key, value]) => row[key] === value),
        );
      }
      if (table === "agent_run_trace_events") {
        return traceRows.filter((row) =>
          Object.entries(where).every(([key, value]) => row[key] === value),
        );
      }
      return [];
    },
    async downloadObject() {
      return new Uint8Array();
    },
    async uploadObject() {},
    async removeObject() {},
  };

  return { gateway, traceRows };
}

const studyRunRow: HiveRow = {
  id: STUDY_RUN_A,
  case_id: CASE_A,
  user_id: USER_A,
  idempotency_key: "idem",
  domain_id: "iep",
  domain_pack_id: "iep",
  domain_pack_version: "1",
  question_set_version: "q/1",
  answer_snapshot_hash: "hash",
  provider_id: "openai",
  provider_mode: "openai",
  prompt_id: "canonical-study-v4",
  prompt_version: "v4",
  prompt_sha256: "abc",
  started_at: "2026-10-09T00:00:00.000Z",
  status: "RUNNING",
};

const caseRow: HiveRow = {
  id: CASE_A,
  user_id: USER_A,
  domain_id: "iep",
  created_at: "2026-10-09T00:00:00.000Z",
  updated_at: "2026-10-09T00:00:00.000Z",
};

describe("AgentRunTraceRepository", () => {
  it("persists STARTED and COMPLETED events", async () => {
    const { gateway, traceRows } = mockGateway({ studyRun: studyRunRow, caseRow });
    const repo = new AgentRunTraceRepository(gateway);

    await repo.appendWithScopeValidation(sampleEvent({ eventType: "STARTED", sequenceNumber: 0 }));
    await repo.appendWithScopeValidation(
      sampleEvent({
        id: "88888888-8888-4888-8888-888888888888",
        eventType: "COMPLETED",
        sequenceNumber: 1,
        payload: { durationMs: 10 },
      }),
    );

    expect(traceRows).toHaveLength(2);
    expect(traceRows[0]?.event_type).toBe("STARTED");
    expect(traceRows[1]?.event_type).toBe("COMPLETED");
  });

  it("records tool, fact, verifier, token, and failure payloads", async () => {
    const { gateway } = mockGateway({ studyRun: studyRunRow, caseRow });
    const repo = new AgentRunTraceRepository(gateway);
    const events: AgentRunTraceEventInput[] = [
      sampleEvent({ sequenceNumber: 0, eventType: "STARTED" }),
      sampleEvent({
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        sequenceNumber: 1,
        eventType: "TOOL_CALLED",
        payload: { tool: "read_pages", pageCount: 1 },
      }),
      sampleEvent({
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        sequenceNumber: 2,
        eventType: "FACT_PROPOSED",
        payload: { candidateFactId: "c1", sourceDocumentId: "doc-a", page: 1 },
      }),
      sampleEvent({
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        sequenceNumber: 3,
        eventType: "EVIDENCE_ACCEPTED",
        payload: { candidateFactId: "c1", reasonCodes: [] },
      }),
      sampleEvent({
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        sequenceNumber: 4,
        eventType: "EVIDENCE_REJECTED",
        payload: { candidateFactId: "c2", reasonCodes: ["quote_no_match"] },
      }),
      sampleEvent({
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        sequenceNumber: 5,
        eventType: "FAILED",
        payload: { errorCode: "ReaderError" },
      }),
      sampleEvent({
        id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        sequenceNumber: 6,
        eventType: "COMPLETED",
        payload: {
          inputTokens: 10,
          outputTokens: 2,
          cacheReadInputTokens: 5,
          cacheWriteInputTokens: 1,
        },
      }),
    ];
    for (const event of events) {
      await repo.appendWithScopeValidation(event);
    }
    expect(events).toHaveLength(7);
  });

  it("treats duplicate event id as idempotent", async () => {
    const { gateway } = mockGateway({ studyRun: studyRunRow, caseRow });
    const repo = new AgentRunTraceRepository(gateway);
    const event = sampleEvent();
    expect(await repo.appendWithScopeValidation(event)).toBe("inserted");
    expect(await repo.appendWithScopeValidation(event)).toBe("duplicate");
  });

  it("rejects replay with same id and different payload", async () => {
    const { gateway } = mockGateway({ studyRun: studyRunRow, caseRow });
    const repo = new AgentRunTraceRepository(gateway);
    const event = sampleEvent();
    await repo.appendWithScopeValidation(event);
    await expect(
      repo.appendWithScopeValidation(
        sampleEvent({ payload: { modelId: "different-model" } }),
      ),
    ).rejects.toBeInstanceOf(AgentRunTraceConflictError);
  });

  it("rejects conflicting attempt sequence identity", async () => {
    const { gateway } = mockGateway({ studyRun: studyRunRow, caseRow });
    const repo = new AgentRunTraceRepository(gateway);
    await repo.appendWithScopeValidation(sampleEvent());
    await expect(
      repo.appendWithScopeValidation(
        sampleEvent({ id: "99999999-9999-4999-8999-999999999999" }),
      ),
    ).rejects.toBeInstanceOf(AgentRunTraceConflictError);
  });

  it("keeps distinct retry attempts separate", async () => {
    const { gateway, traceRows } = mockGateway({ studyRun: studyRunRow, caseRow });
    const repo = new AgentRunTraceRepository(gateway);
    await repo.appendWithScopeValidation(sampleEvent({ attemptId: ATTEMPT_A, sequenceNumber: 0 }));
    await repo.appendWithScopeValidation(
      sampleEvent({
        id: "99999999-9999-4999-8999-999999999999",
        attemptId: ATTEMPT_B,
        sequenceNumber: 0,
      }),
    );
    expect(traceRows.map((row) => row.attempt_id)).toEqual([ATTEMPT_A, ATTEMPT_B]);
  });

  it("rejects cross-user study run scope", async () => {
    const { gateway } = mockGateway({
      studyRun: { ...studyRunRow, user_id: USER_B },
      caseRow,
    });
    const repo = new AgentRunTraceRepository(gateway);
    await expect(repo.appendWithScopeValidation(sampleEvent())).rejects.toMatchObject({
      code: "STUDY_RUN_SCOPE_VIOLATION",
    });
  });

  it("rejects cross-case study run scope", async () => {
    const { gateway } = mockGateway({ studyRun: studyRunRow, caseRow });
    const repo = new AgentRunTraceRepository(gateway);
    await expect(
      repo.appendWithScopeValidation(
        sampleEvent({ caseId: "00000000-0000-4000-8000-000000000001" }),
      ),
    ).rejects.toMatchObject({ code: "CASE_SCOPE_VIOLATION" });
  });

  it("does not swallow database write failures", async () => {
    const gateway: HiveGateway = {
      async insert() {
        throw new Error("db unavailable");
      },
      async upsert() {
        throw new Error("unused");
      },
      async updateWhere() {
        throw new Error("unused");
      },
      async selectWhere(table) {
        if (table === "study_runs") {
          return [studyRunRow];
        }
        if (table === "cases") {
          return [caseRow];
        }
        return [];
      },
      async downloadObject() {
        return new Uint8Array();
      },
      async uploadObject() {},
      async removeObject() {},
    };
    const repo = new AgentRunTraceRepository(gateway);
    await expect(repo.appendWithScopeValidation(sampleEvent())).rejects.toThrow(
      "Failed to persist agent run trace event",
    );
  });

  it("rejects forbidden payload fields", () => {
    expect(() => assertBoundedTracePayload({ quote: "secret" })).toThrow(
      AgentRunTraceValidationError,
    );
    expect(() => validateAgentRunTraceEvent({ ...sampleEvent(), payload: { prompt: "x" } })).toThrow(
      AgentRunTraceValidationError,
    );
  });
});
