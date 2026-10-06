import type { HiveGateway, HiveRow } from "./hive-gateway.js";

export type ShadowStudyArtifactStatus = "running" | "succeeded" | "failed";

export type ShadowStudyArtifactRecord = {
  id: string;
  caseId: string;
  studyRunId: string;
  userId: string;
  status: ShadowStudyArtifactStatus;
  failedStep: string | null;
  findingsJson: unknown;
  statementsCount: number;
  factsCount: number;
  multiSourceFactsCount: number;
  coverageJson: unknown;
  dropsJson: unknown;
  tokenUsageJson: unknown;
  startedAt: string;
  completedAt: string | null;
};

function mapRow(row: HiveRow): ShadowStudyArtifactRecord {
  return {
    id: String(row.id),
    caseId: String(row.case_id),
    studyRunId: String(row.study_run_id),
    userId: String(row.user_id),
    status: String(row.status) as ShadowStudyArtifactStatus,
    failedStep: row.failed_step != null ? String(row.failed_step) : null,
    findingsJson: row.findings_json ?? null,
    statementsCount: Number(row.statements_count ?? 0),
    factsCount: Number(row.facts_count ?? 0),
    multiSourceFactsCount: Number(row.multi_source_facts_count ?? 0),
    coverageJson: row.coverage_json ?? null,
    dropsJson: row.drops_json ?? null,
    tokenUsageJson: row.token_usage_json ?? null,
    startedAt: String(row.started_at),
    completedAt: row.completed_at != null ? String(row.completed_at) : null,
  };
}

export class SupabaseShadowStudyArtifactRepository {
  constructor(private readonly gateway: HiveGateway) {}

  async getByStudyRunId(studyRunId: string): Promise<ShadowStudyArtifactRecord | null> {
    const rows = await this.gateway.selectWhere(
      "shadow_study_artifacts",
      { study_run_id: studyRunId },
      { limit: 1 },
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async insertRunning(input: {
    id: string;
    caseId: string;
    studyRunId: string;
    userId: string;
    startedAt: string;
  }): Promise<ShadowStudyArtifactRecord | null> {
    try {
      await this.gateway.insert("shadow_study_artifacts", {
        id: input.id,
        case_id: input.caseId,
        study_run_id: input.studyRunId,
        user_id: input.userId,
        status: "running",
        failed_step: null,
        findings_json: null,
        statements_count: 0,
        facts_count: 0,
        multi_source_facts_count: 0,
        coverage_json: null,
        drops_json: null,
        token_usage_json: null,
        started_at: input.startedAt,
        completed_at: null,
      });
      return this.getByStudyRunId(input.studyRunId);
    } catch {
      return this.getByStudyRunId(input.studyRunId);
    }
  }

  async markFailed(studyRunId: string, failedStep: string): Promise<void> {
    await this.gateway.updateWhere(
      "shadow_study_artifacts",
      {
        status: "failed",
        failed_step: failedStep,
        completed_at: new Date().toISOString(),
      },
      { study_run_id: studyRunId },
    );
  }

  async markSucceeded(
    studyRunId: string,
    payload: {
      findingsJson: unknown;
      statementsCount: number;
      factsCount: number;
      multiSourceFactsCount: number;
      coverageJson: unknown;
      dropsJson: unknown;
      tokenUsageJson: unknown;
    },
  ): Promise<void> {
    await this.gateway.updateWhere(
      "shadow_study_artifacts",
      {
        status: "succeeded",
        failed_step: null,
        findings_json: payload.findingsJson,
        statements_count: payload.statementsCount,
        facts_count: payload.factsCount,
        multi_source_facts_count: payload.multiSourceFactsCount,
        coverage_json: payload.coverageJson,
        drops_json: payload.dropsJson,
        token_usage_json: payload.tokenUsageJson,
        completed_at: new Date().toISOString(),
      },
      { study_run_id: studyRunId },
    );
  }
}
