import type { CanonicalStudyValidationResult } from "@hiveforyou/shared/canonical-study";
import type { CanonicalStudyValidationResultV3 } from "@hiveforyou/shared/case-intelligence/3/validation-result";

import { decideStudyArtifactSave } from "./study-artifact-persistence";

export type StudyArtifactRecord = {
  studyRunId: string;
  caseId: string;
  userId: string;
  rawProposalJson: unknown | null;
  validationResultJson: CanonicalStudyValidationResult | CanonicalStudyValidationResultV3;
  createdAt: string;
};

export interface StudyArtifactRepository {
  save(record: Omit<StudyArtifactRecord, "createdAt">): Promise<void>;
  getByStudyRunId(studyRunId: string): Promise<StudyArtifactRecord | null>;
}

export class InMemoryStudyArtifactRepository implements StudyArtifactRepository {
  private readonly byRunId = new Map<string, StudyArtifactRecord>();

  async save(record: Omit<StudyArtifactRecord, "createdAt">): Promise<void> {
    const existing = this.byRunId.get(record.studyRunId);
    const decision = decideStudyArtifactSave(
      existing
        ? {
            rawProposalJson: existing.rawProposalJson,
            validationResultJson: existing.validationResultJson as CanonicalStudyValidationResultV3,
          }
        : null,
      {
        rawProposalJson: record.rawProposalJson,
        validationResultJson: record.validationResultJson as CanonicalStudyValidationResultV3,
      },
    );
    if (decision.action === "noop") {
      return;
    }
    const nextValidation =
      decision.action === "updateValidation"
        ? decision.validationResultJson
        : (record.validationResultJson as CanonicalStudyValidationResultV3);
    this.byRunId.set(record.studyRunId, {
      ...record,
      validationResultJson: nextValidation,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    });
  }

  async getByStudyRunId(studyRunId: string): Promise<StudyArtifactRecord | null> {
    return this.byRunId.get(studyRunId) ?? null;
  }
}
