import { randomUUID } from "node:crypto";

import { withSessionOwner } from "@hiveforyou/core";
import type { StudyArtifactRecord, StudyArtifactRepository } from "@hiveforyou/core";

import type { HiveGateway } from "./hive-gateway";

export class SupabaseStudyArtifactRepository implements StudyArtifactRepository {
  constructor(
    private readonly gateway: HiveGateway,
    private readonly userId: string,
  ) {}

  async save(record: {
    studyRunId: string;
    caseId: string;
    userId: string;
    rawProposalJson: unknown | null;
    validationResultJson: StudyArtifactRecord["validationResultJson"];
  }): Promise<void> {
    await this.gateway.insert(
      "study_artifacts",
      withSessionOwner(this.userId, {
        id: randomUUID(),
        study_run_id: record.studyRunId,
        case_id: record.caseId,
        raw_proposal_json: record.rawProposalJson,
        validation_result_json: record.validationResultJson,
      }),
    );
  }

  async getByStudyRunId(studyRunId: string): Promise<StudyArtifactRecord | null> {
    const rows = await this.gateway.selectWhere(
      "study_artifacts",
      { study_run_id: studyRunId, user_id: this.userId },
      { orderBy: "created_at", ascending: false, limit: 1 },
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      studyRunId: String(row.study_run_id),
      caseId: String(row.case_id),
      userId: String(row.user_id),
      rawProposalJson: row.raw_proposal_json ?? null,
      validationResultJson: row.validation_result_json as StudyArtifactRecord["validationResultJson"],
      createdAt: String(row.created_at),
    };
  }
}
