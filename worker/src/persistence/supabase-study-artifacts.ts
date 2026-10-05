import { randomUUID } from "node:crypto";

import {
  decideStudyArtifactSave,
  isStudyArtifactDuplicateKeyError,
  withSessionOwner,
} from "@hiveforyou/core";
import type { StudyArtifactRecord, StudyArtifactRepository } from "@hiveforyou/core";
import type { CanonicalStudyValidationResultV3 } from "@hiveforyou/shared/case-intelligence/3/validation-result";

import type { HiveGateway } from "./hive-gateway";

function toSaveInput(record: {
  rawProposalJson: unknown | null;
  validationResultJson: StudyArtifactRecord["validationResultJson"];
}): {
  rawProposalJson: unknown | null;
  validationResultJson: CanonicalStudyValidationResultV3;
} {
  return {
    rawProposalJson: record.rawProposalJson,
    validationResultJson: record.validationResultJson as CanonicalStudyValidationResultV3,
  };
}

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
    await this.saveWithRetry(record, 0);
  }

  private async saveWithRetry(
    record: {
      studyRunId: string;
      caseId: string;
      userId: string;
      rawProposalJson: unknown | null;
      validationResultJson: StudyArtifactRecord["validationResultJson"];
    },
    attempt: number,
  ): Promise<void> {
    const existing = await this.getByStudyRunId(record.studyRunId);
    const decision = decideStudyArtifactSave(
      existing ? toSaveInput(existing) : null,
      toSaveInput(record),
    );

    if (decision.action === "noop") {
      return;
    }

    if (decision.action === "updateValidation") {
      await this.gateway.updateWhere(
        "study_artifacts",
        { validation_result_json: decision.validationResultJson },
        { study_run_id: record.studyRunId, user_id: this.userId },
      );
      return;
    }

    try {
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
    } catch (error) {
      if (!isStudyArtifactDuplicateKeyError(error)) {
        throw error;
      }
      if (attempt >= 5) {
        throw error;
      }
      await this.saveWithRetry(record, attempt + 1);
    }
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
