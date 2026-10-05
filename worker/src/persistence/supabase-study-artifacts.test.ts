import { describe, expect, it } from "vitest";

import {
  StudyArtifactContentMismatchError,
  fingerprintStudyArtifactContent,
  isStudyArtifactProposePlaceholder,
} from "@hiveforyou/core";
import type { CanonicalStudyValidationResultV3 } from "@hiveforyou/shared/case-intelligence/3/validation-result";

import type { HiveGateway, HiveRow } from "./hive-gateway";
import { SupabaseStudyArtifactRepository } from "./supabase-study-artifacts";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CASE_ID = "22222222-2222-4222-8222-222222222222";
const STUDY_RUN_ID = "33333333-3333-4333-8333-333333333333";

const placeholderValidation: CanonicalStudyValidationResultV3 = {
  status: "FAILED",
  accepted: { entities: [], claims: [], conflicts: [], missingInformation: [] },
  rejected: [],
  warnings: [],
  unresolved: [],
  validationErrors: [],
  provenanceErrors: [],
  integrityErrors: [],
};

const succeededValidation: CanonicalStudyValidationResultV3 = {
  status: "SUCCEEDED",
  accepted: { entities: [], claims: [], conflicts: [], missingInformation: [] },
  rejected: [],
  warnings: [],
  unresolved: [],
  validationErrors: [],
  provenanceErrors: [],
  integrityErrors: [],
};

const proposal = { modelMetadata: { proposalMode: "fixture" } };

function studyArtifactsGateway(): HiveGateway & { rows: HiveRow[] } {
  const rows: HiveRow[] = [];
  const matches = (row: HiveRow, where: Record<string, string | number>) =>
    Object.entries(where).every(
      ([column, value]) => String(row[column]) === String(value),
    );

  return {
    rows,
    async insert(_table, row) {
      const duplicate = rows.some((candidate) => candidate.study_run_id === row.study_run_id);
      if (duplicate) {
        throw new Error(
          'duplicate key value violates unique constraint "study_artifacts_study_run_id_key"',
        );
      }
      rows.push({ ...row, created_at: row.created_at ?? new Date().toISOString() });
    },
    async upsert() {
      throw new Error("unused");
    },
    async updateWhere(_table, patch, where) {
      const row = rows.find((candidate) => matches(candidate, where));
      if (!row) {
        throw new Error("STUDY_ARTIFACT_ROW_MISSING");
      }
      Object.assign(row, patch);
    },
    async selectWhere(_table, where, options) {
      let selected = rows.filter((row) => matches(row, where));
      if (options?.orderBy) {
        selected = [...selected].sort((a, b) =>
          String(a[options.orderBy!]).localeCompare(String(b[options.orderBy!])),
        );
      }
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

describe("SupabaseStudyArtifactRepository", () => {
  it("completes validation after propose insert and no-ops on second validate save", async () => {
    const gateway = studyArtifactsGateway();
    const repo = new SupabaseStudyArtifactRepository(gateway, USER_ID);

    await repo.save({
      studyRunId: STUDY_RUN_ID,
      caseId: CASE_ID,
      userId: USER_ID,
      rawProposalJson: proposal,
      validationResultJson: placeholderValidation,
    });
    expect(gateway.rows).toHaveLength(1);
    expect(
      isStudyArtifactProposePlaceholder(
        gateway.rows[0]!.validation_result_json as CanonicalStudyValidationResultV3,
      ),
    ).toBe(true);

    await repo.save({
      studyRunId: STUDY_RUN_ID,
      caseId: CASE_ID,
      userId: USER_ID,
      rawProposalJson: proposal,
      validationResultJson: succeededValidation,
    });
    expect(gateway.rows).toHaveLength(1);
    expect(gateway.rows[0]!.validation_result_json).toMatchObject({ status: "SUCCEEDED" });

    const fp = fingerprintStudyArtifactContent({
      rawProposalJson: proposal,
      validationResultJson: succeededValidation,
    });

    await repo.save({
      studyRunId: STUDY_RUN_ID,
      caseId: CASE_ID,
      userId: USER_ID,
      rawProposalJson: proposal,
      validationResultJson: succeededValidation,
    });
    expect(gateway.rows).toHaveLength(1);
    expect(
      fingerprintStudyArtifactContent({
        rawProposalJson: gateway.rows[0]!.raw_proposal_json,
        validationResultJson: gateway.rows[0]!
          .validation_result_json as CanonicalStudyValidationResultV3,
      }),
    ).toBe(fp);
  });

  it("throws StudyArtifactContentMismatchError when validation differs after completion", async () => {
    const gateway = studyArtifactsGateway();
    const repo = new SupabaseStudyArtifactRepository(gateway, USER_ID);

    await repo.save({
      studyRunId: STUDY_RUN_ID,
      caseId: CASE_ID,
      userId: USER_ID,
      rawProposalJson: proposal,
      validationResultJson: succeededValidation,
    });

    await expect(
      repo.save({
        studyRunId: STUDY_RUN_ID,
        caseId: CASE_ID,
        userId: USER_ID,
        rawProposalJson: proposal,
        validationResultJson: { ...succeededValidation, status: "NEEDS_REVIEW" },
      }),
    ).rejects.toBeInstanceOf(StudyArtifactContentMismatchError);
  });
});
