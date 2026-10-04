import { describe, expect, it } from "vitest";

import type { IntakeRunRecord } from "@hiveforyou/intake";

import { createSupabaseHiveGateway } from "./hive-gateway.js";
import { WorkerIntakeRepository } from "./worker-intake-repository.js";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

function sampleRun(userId: string): IntakeRunRecord {
  const now = "2026-10-04T12:00:00.000Z";
  return {
    id: "33333333-3333-4333-8333-333333333333",
    caseId: "44444444-4444-4444-8444-444444444444",
    userId,
    idempotencyKey: "idem-1",
    status: "QUEUED",
    classifier: "LOCAL",
    classifierVersion: null,
    startedAt: now,
    completedAt: null,
    errorCode: null,
    rawIntent: null,
    explicitDomainId: null,
    jevDomainProposal: null,
    jevDomainConfidence: null,
    resolvedDomainId: null,
    resolutionSource: null,
    studyPath: null,
    packExecutionJson: null,
    intakeQueueSeq: 0,
    createdAt: now,
    updatedAt: now,
  };
}

describe("WorkerIntakeRepository user scoping", () => {
  it("does not return another user's intake run", async () => {
    const rows: Record<string, unknown>[] = [];
    const gateway = {
      insert: async (_table: string, row: Record<string, unknown>) => {
        rows.push(row);
      },
      updateWhere: async () => {},
      selectWhere: async (_table: string, where: Record<string, string | number>) => {
        return rows.filter((row) =>
          Object.entries(where).every(([key, value]) => row[key] === value),
        );
      },
      downloadObject: async () => new Uint8Array(),
    };
    const repoA = new WorkerIntakeRepository(gateway as ReturnType<typeof createSupabaseHiveGateway>, USER_A);
    await repoA.insert(sampleRun(USER_A));

    const asOwner = await repoA.getById(USER_A, sampleRun(USER_A).id);
    expect(asOwner?.userId).toBe(USER_A);

    const crossUser = await repoA.getById(USER_B, sampleRun(USER_A).id);
    expect(crossUser).toBeNull();
  });
});
