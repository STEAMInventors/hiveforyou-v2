import { afterEach, describe, expect, it, vi } from "vitest";

import { readWorkerEnv } from "../env.js";
import { createReaderHttpClient } from "./create-reader-http-client.js";

const REQUIRED_WORKER_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
  HIVE_STORAGE_BUCKET: "case-documents",
} as const;

function workerEnvStrings(env: ReturnType<typeof readWorkerEnv>): Record<string, string | undefined> {
  return env as unknown as Record<string, string | undefined>;
}

describe("pack-driven Reader env handoff", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("readWorkerEnv preserves trimmed hive-agents and pack-driven Reader settings", () => {
    const env = readWorkerEnv({
      ...REQUIRED_WORKER_ENV,
      HIVE_AGENTS_SERVICE_TOKEN: "  reader-token  ",
      HIVE_AGENTS_HOST: "  hive-agents  ",
      HIVE_AGENTS_PORT: " 4321 ",
      HIVE_PACK_DRIVEN_READER_PROPOSAL_JSON: " /app/pack/proposal.json ",
    });

    expect(env.HIVE_AGENTS_SERVICE_TOKEN).toBe("reader-token");
    expect(env.HIVE_AGENTS_HOST).toBe("hive-agents");
    expect(env.HIVE_AGENTS_PORT).toBe("4321");
    expect(env.HIVE_PACK_DRIVEN_READER_PROPOSAL_JSON).toBe("/app/pack/proposal.json");
  });

  it("createReaderHttpClient receives the service token from parsed worker env", async () => {
    const env = readWorkerEnv({
      ...REQUIRED_WORKER_ENV,
      HIVE_AGENTS_SERVICE_TOKEN: "reader-token",
      HIVE_AGENTS_HOST: "hive-agents",
      HIVE_AGENTS_PORT: "4321",
    });
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ audit: { persisted: true, status: "persisted" } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const client = createReaderHttpClient(workerEnvStrings(env));
    await client({
      caseId: "case-1",
      userId: "user-1",
      domainId: "iep",
      studyRunId: "run-1",
      attemptId: "attempt-1",
      documents: [],
      readerMode: "pack_driven",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://hive-agents:4321/study/reader",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer reader-token",
        }),
      }),
    );
  });

  it("createReaderHttpClient keeps host and port defaults when omitted from worker env", () => {
    const env = readWorkerEnv({
      ...REQUIRED_WORKER_ENV,
      HIVE_AGENTS_SERVICE_TOKEN: "reader-token",
    });

    expect(() => createReaderHttpClient(workerEnvStrings(env))).not.toThrow();
    const client = createReaderHttpClient(workerEnvStrings(env));
    expect(client).toBeTypeOf("function");
  });
});
