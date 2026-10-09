import { request as httpRequest } from "node:http";

import { describe, expect, it, vi } from "vitest";

import type {
  AgentRunTraceAppendResult,
  AgentRunTraceEventInput,
  AgentRunTraceRepository,
} from "../persistence/agent-run-trace.js";
import {
  closeVerifierServer,
  createVerifierServer,
  listenVerifierServer,
} from "../verifier/server.js";
import type { ReaderVerifierDeps } from "../verifier/verify-reader-fact.js";
import type { AgentRunTraceIngestDeps } from "./agent-run-trace-ingest.js";

const TOKEN = "test-verifier-token";

const USER_A = "11111111-1111-4111-8111-111111111111";
const CASE_A = "44444444-4444-4444-8444-444444444444";
const STUDY_RUN_A = "33333333-3333-4333-8333-333333333333";
const ATTEMPT_A = "55555555-5555-4555-8555-555555555555";

function sampleTraceEvent(): AgentRunTraceEventInput {
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
  };
}

function noopVerifierDeps(): ReaderVerifierDeps {
  return {
    async resolveScope() {
      return null;
    },
    async loadDocumentPages() {
      return null;
    },
  };
}

function httpJson(input: {
  port: number;
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
}): Promise<{ status: number; text: string }> {
  return new Promise((resolvePromise, reject) => {
    const req = httpRequest(
      {
        hostname: "127.0.0.1",
        port: input.port,
        path: input.path,
        method: input.method,
        headers: input.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolvePromise({
            status: res.statusCode ?? 0,
            text: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.on("error", reject);
    if (input.body) {
      req.write(input.body);
    }
    req.end();
  });
}

describe("agent run trace ingest HTTP route", () => {
  it("returns 503 when trace ingest is not configured on the verifier listener", async () => {
    const server = createVerifierServer({ token: TOKEN, deps: noopVerifierDeps() });
    const { port } = await listenVerifierServer(server, { host: "127.0.0.1", port: 0 });
    try {
      const res = await httpJson({
        port,
        method: "POST",
        path: "/internal/agent-run-trace/events",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify({ events: [sampleTraceEvent()] }),
      });
      expect(res.status).toBe(503);
    } finally {
      await closeVerifierServer(server);
    }
  });

  it("ingests an authenticated trace batch when trace ingest is wired", async () => {
    const append = vi.fn(
      async (_event: AgentRunTraceEventInput): Promise<AgentRunTraceAppendResult> => "inserted",
    );
    const traceDeps: AgentRunTraceIngestDeps = {
      repository: { appendWithScopeValidation: append } as AgentRunTraceRepository,
    };

    const server = createVerifierServer({
      token: TOKEN,
      deps: noopVerifierDeps(),
      traceIngest: { token: TOKEN, deps: traceDeps },
    });
    const { port } = await listenVerifierServer(server, { host: "127.0.0.1", port: 0 });
    try {
      const event = sampleTraceEvent();
      const res = await httpJson({
        port,
        method: "POST",
        path: "/internal/agent-run-trace/events",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify({ events: [event] }),
      });
      expect(res.status).toBe(200);
      expect(JSON.parse(res.text)).toEqual({
        results: [{ id: event.id, outcome: "inserted" }],
      });
      expect(append).toHaveBeenCalledTimes(1);
      expect(append.mock.calls[0]?.[0]?.id).toBe(event.id);
    } finally {
      await closeVerifierServer(server);
    }
  });
});