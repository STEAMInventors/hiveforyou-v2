import { randomUUID } from "node:crypto";

import {
  decideProposeStudyArtifactSave,
  decideStudyArtifactSave,
  decideValidateStudyArtifactSave,
  isStudyArtifactDuplicateKeyError,
  withSessionOwner,
} from "@hiveforyou/core";
import type { StudyArtifactSaveDecision } from "@hiveforyou/core";
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

type SavePhase = "full" | "propose" | "validate";

export class SupabaseStudyArtifactRepository implements StudyArtifactRepository {
  constructor(
    private readonly gateway: HiveGateway,
    private readonly userId: string,
  ) {}

  async save(record: Parameters<StudyArtifactRepository["save"]>[0]): Promise<void> {
    await this.persist(record, "full", 0);
  }

  async saveProposed(record: Parameters<StudyArtifactRepository["saveProposed"]>[0]): Promise<void> {
    await this.persist(record, "propose", 0);
  }

  async saveValidated(record: Parameters<StudyArtifactRepository["saveValidated"]>[0]): Promise<void> {
    await this.persist(record, "validate", 0);
  }

  private decide(
    phase: SavePhase,
    studyRunId: string,
    existing: ReturnType<typeof toSaveInput> | null,
    incoming: ReturnType<typeof toSaveInput>,
  ): StudyArtifactSaveDecision {
    if (phase === "propose") {
      return decideProposeStudyArtifactSave(existing, incoming);
    }
    if (phase === "validate") {
      return decideValidateStudyArtifactSave(studyRunId, existing, incoming);
    }
    return decideStudyArtifactSave(existing, incoming);
  }

  private async persist(
    record: {
      studyRunId: string;
      caseId: string;
      userId: string;
      rawProposalJson: unknown | null;
      validationResultJson: StudyArtifactRecord["validationResultJson"];
    },
    phase: SavePhase,
    attempt: number,
  ): Promise<void> {
    const existingRecord = await this.lookupByStudyRunId(record.studyRunId);
    const existing = existingRecord ? toSaveInput(existingRecord) : null;
    const incoming = toSaveInput(record);
    const decision = this.decide(phase, record.studyRunId, existing, incoming);

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

    if (phase === "validate") {
      throw new Error("STUDY_ARTIFACT_VALIDATE_INSERT_FORBIDDEN");
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
      await this.persist(record, phase, attempt + 1);
    }
  }

  private async lookupByStudyRunId(studyRunId: string): Promise<StudyArtifactRecord | null> {
    const scoped = await this.getByStudyRunId(studyRunId);
    if (scoped) {
      return scoped;
    }
    const rows = await this.gateway.selectWhere(
      "study_artifacts",
      { study_run_id: studyRunId },
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
