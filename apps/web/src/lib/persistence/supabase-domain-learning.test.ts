import { describe, expect, it } from "vitest";

import type { HiveGateway, HiveRow } from "./hive-gateway";
import { SupabaseCaseQuestionRepository } from "./supabase-domain-learning";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

function memoryGateway(): HiveGateway {
  const rows: HiveRow[] = [];
  const matches = (row: HiveRow, where: Record<string, string | number>) =>
    Object.entries(where).every(
      ([column, value]) => String(row[column]) === String(value),
    );
  return {
    async insert(_table, row) {
      rows.push({ ...row });
    },
    async upsert(_table, row) {
      rows.push({ ...row });
    },
    async updateWhere(_table, row, where) {
      for (const existing of rows) {
        if (matches(existing, where)) {
          Object.assign(existing, row);
        }
      }
    },
    async selectWhere(_table, where) {
      return rows.filter((row) => matches(row, where)).map((row) => ({ ...row }));
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

describe("supabase domain learning adapters", () => {
  it("denies cross-user reads of private case questions", async () => {
    const gateway = memoryGateway();
    const ownerRepo = new SupabaseCaseQuestionRepository(gateway, USER_A);
    await ownerRepo.insert({
      id: "question-1",
      userId: USER_A,
      caseId: "case-1",
      studyRunId: null,
      domainId: "iep",
      domainPackId: "hive.domain.iep@0.0.0-scaffold",
      domainPackVersion: "0.0.0-scaffold",
      questionSetVersion: "qs-1",
      questionKey: "missing_expected_document",
      questionType: "MISSING_FACT",
      wordingVersion: "v1",
      questionText: "Prompt",
      required: true,
      triggerType: "MISSING_EXPECTED_DOCUMENT",
      triggerKey: "missing-progress",
      triggerMetadata: { clientQuestionId: "q1" },
      affectsCanonicalTruth: true,
      affectsAnalysis: true,
      affectsProjection: true,
      createdAt: new Date().toISOString(),
      clientQuestionId: "q1",
    });

    const intruderRepo = new SupabaseCaseQuestionRepository(gateway, USER_B);
    const hidden = await intruderRepo.findByCaseAndKey(
      "case-1",
      "qs-1",
      "missing_expected_document",
      "v1",
    );
    expect(hidden).toBeNull();
  });
});
