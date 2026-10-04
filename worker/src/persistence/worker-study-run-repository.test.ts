import { describe, expect, it } from "vitest";

import type { CanonicalStudyRun } from "@hiveforyou/shared/canonical-study";

import { createSupabaseHiveGateway } from "./hive-gateway.js";
import { SupabaseStudyRunRepository } from "./worker-supabase-repositories.js";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

function sampleRun(userId: string): CanonicalStudyRun {
  const now = "2026-10-04T12:00:00.000Z";
  return {
    studyRunId: "33333333-3333-4333-8333-333333333333",
    caseId: "44444444-4444-4444-8444-444444444444",
    idempotencyKey: "idem-study-1",
    studyContextId: "33333333-3333-4333-8333-333333333333",
    domainId: "iep",
    domainPackId: "iep",
    domainPackVersion: "1",
    questionSetVersion: "intake-study-empty/1",
    answerSnapshotHash: "hash",
    providerId: "openai",
    providerMode: "openai",
    promptId: "canonical-study-v4",
    promptVersion: "v4",
    promptSha256: "abc",
    startedAt: now,
    status: "QUEUED",
  };
}

describe("SupabaseStudyRunRepository user scoping (worker)", () => {
  it("does not return another user's study run", async () => {
    const rows: Record<string, unknown>[] = [];
    const gateway = {
      insert: async (_table: string, row: Record<string, unknown>) => {
        rows.push(row);
      },
      upsert: async (_table: string, row: Record<string, unknown>) => {
        rows.push(row);
      },
      updateWhere: async () => {},
      selectWhere: async (_table: string, where: Record<string, string | number>) => {
        return rows.filter((row) =>
          Object.entries(where).every(([key, value]) => row[key] === value),
        );
      },
      downloadObject: async () => new Uint8Array(),
      uploadObject: async () => {},
      removeObject: async () => {},
    };
    const repoA = new SupabaseStudyRunRepository(
      gateway as ReturnType<typeof createSupabaseHiveGateway>,
      USER_A,
    );
    await repoA.save(sampleRun(USER_A));

    const asOwner = await repoA.getByStudyRunId(sampleRun(USER_A).studyRunId);
    expect(asOwner?.studyRunId).toBe(sampleRun(USER_A).studyRunId);

    const crossUser = await repoA.getByStudyRunId(sampleRun(USER_A).studyRunId);
    expect(crossUser).not.toBeNull();
    const repoB = new SupabaseStudyRunRepository(
      gateway as ReturnType<typeof createSupabaseHiveGateway>,
      USER_B,
    );
    const blocked = await repoB.getByStudyRunId(sampleRun(USER_A).studyRunId);
    expect(blocked).toBeNull();
  });
});
