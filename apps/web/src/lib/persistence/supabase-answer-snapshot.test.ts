import { describe, expect, it } from "vitest";

import { hashCanonicalJson } from "@hiveforyou/core";
import type { QuestionsAnswerSnapshot } from "@hiveforyou/shared/questions";

import type { HiveGateway, HiveRow } from "./hive-gateway";
import { SupabaseAnswerSnapshotRepository } from "./supabase-repositories";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CASE_ID = "22222222-2222-4222-8222-222222222222";

const snapshot: QuestionsAnswerSnapshot = {
  questionSetId: "qs-1",
  answers: {},
  missingNodeStates: {},
  ambiguityNodeStates: {},
  analysisIntent: null,
  userContext: null,
};

function answerSnapshotsGateway(existing: HiveRow[] = []): HiveGateway {
  const rows = [...existing];
  const matches = (row: HiveRow, where: Record<string, string | number>) =>
    Object.entries(where).every(
      ([column, value]) => String(row[column]) === String(value),
    );

  return {
    async insert(_table, row) {
      const duplicate = rows.find(
        (candidate) =>
          candidate.case_id === row.case_id &&
          candidate.snapshot_hash === row.snapshot_hash,
      );
      if (duplicate) {
        throw new Error(
          'duplicate key value violates unique constraint "answer_snapshots_case_id_snapshot_hash_key"',
        );
      }
      rows.push({ ...row });
    },
    async upsert() {
      throw new Error("unused");
    },
    async updateWhere() {
      throw new Error("unused");
    },
    async selectWhere(_table, where, options) {
      let selected = rows.filter((row) => matches(row, where));
      if (options?.limit) {
        selected = selected.slice(0, options.limit);
      }
      return selected.map((row) => ({ ...row }));
    },
    async uploadObject() {
      throw new Error("unused");
    },
    async downloadObject() {
      throw new Error("unused");
    },
    async removeObject() {
      return undefined;
    },
  };
}

describe("SupabaseAnswerSnapshotRepository", () => {
  it("returns the winning snapshot after a concurrent insert unique-constraint race", async () => {
    const gateway = answerSnapshotsGateway([
      {
        id: "winner-snapshot",
        case_id: CASE_ID,
        user_id: USER_ID,
        question_set_id: "qs-1",
        snapshot_json: snapshot,
        snapshot_hash: hashCanonicalJson(snapshot),
        created_at: "2026-09-28T00:00:00.000Z",
      },
    ]);
    const repo = new SupabaseAnswerSnapshotRepository(gateway, USER_ID);

    const persisted = await repo.save({
      caseId: CASE_ID,
      questionSetId: "qs-1",
      snapshot,
    });

    expect(persisted.id).toBe("winner-snapshot");
    expect(persisted.caseId).toBe(CASE_ID);
  });

  it("resolves two concurrent saves to one business key row", async () => {
    const gateway = answerSnapshotsGateway();
    const repo = new SupabaseAnswerSnapshotRepository(gateway, USER_ID);
    const input = { caseId: CASE_ID, questionSetId: "qs-1", snapshot };

    const [a, b] = await Promise.all([repo.save(input), repo.save(input)]);

    expect(a.id).toBe(b.id);
    expect(a.snapshotHash).toBe(b.snapshotHash);
  });
});
