import { describe, expect, it } from "vitest";

import type { CanonicalStudyRun } from "@hiveforyou/shared/canonical-study";

import type { HiveGateway, HiveRow } from "./hive-gateway";
import { SupabaseStudyRunRepository } from "./supabase-repositories";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function baseRun(overrides: Partial<CanonicalStudyRun> = {}): CanonicalStudyRun {
  return {
    studyRunId: "run-a",
    caseId: "case-1",
    idempotencyKey: "idem-1",
    studyContextId: "run-a",
    domainId: "iep",
    domainPackId: "hive.domain.iep",
    domainPackVersion: "scaffold",
    questionSetVersion: "qs-1",
    answerSnapshotHash: "hash-1",
    providerId: "fixture-canonical-study-engine",
    providerMode: "fixture",
    promptId: "canonical-study",
    promptVersion: "canonical-study-v1",
    promptSha256: "abc123",
    startedAt: "2026-09-28T00:00:00.000Z",
    status: "RUNNING",
    ...overrides,
  };
}

function studyRunsGateway(existing: HiveRow[] = []): HiveGateway {
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
          candidate.idempotency_key === row.idempotency_key,
      );
      if (duplicate) {
        throw new Error(
          'duplicate key value violates unique constraint "study_runs_case_id_idempotency_key_key"',
        );
      }
      rows.push({ ...row });
    },
    async upsert(_table, row, onConflict) {
      const index = rows.findIndex((candidate) => candidate[onConflict] === row[onConflict]);
      if (index >= 0) {
        rows[index] = { ...rows[index], ...row };
        return;
      }
      rows.push({ ...row });
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

describe("SupabaseStudyRunRepository", () => {
  it("returns the winning run id after a concurrent insert unique-constraint race", async () => {
    const gateway = studyRunsGateway([
      {
        id: "winner",
        case_id: "case-1",
        user_id: USER_ID,
        idempotency_key: "idem-1",
        study_context_version: "canonical-study-context/1",
        study_context_id: "winner",
        domain_id: "iep",
        domain_pack_id: "hive.domain.iep",
        domain_pack_version: "scaffold",
        engine_provider: "fixture-canonical-study-engine",
        provider_mode: "fixture",
        prompt_id: "canonical-study",
        prompt_version: "canonical-study-v1",
        prompt_sha256: "abc123",
        question_set_version: "qs-1",
        answer_snapshot_hash: "hash-1",
        status: "RUNNING",
        started_at: "2026-09-28T00:00:00.000Z",
        completed_at: null,
        error_code: null,
        error_message_safe: null,
        validation_result_json: null,
        case_intelligence_version: null,
        created_at: "2026-09-28T00:00:00.000Z",
        updated_at: "2026-09-28T00:00:00.000Z",
      },
    ]);
    const repo = new SupabaseStudyRunRepository(gateway, USER_ID);

    const persisted = await repo.save(
      baseRun({
        studyRunId: "loser",
        studyContextId: "loser",
      }),
    );

    expect(persisted.studyRunId).toBe("winner");
    expect(persisted.status).toBe("RUNNING");
  });
});
