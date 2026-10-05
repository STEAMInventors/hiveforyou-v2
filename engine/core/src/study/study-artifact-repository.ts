import type { CanonicalStudyValidationResult } from "@hiveforyou/shared/canonical-study";
import type { CanonicalStudyValidationResultV3 } from "@hiveforyou/shared/case-intelligence/3/validation-result";

import {
  decideProposeStudyArtifactSave,
  decideStudyArtifactSave,
  decideValidateStudyArtifactSave,
  type StudyArtifactSaveDecision,
} from "./study-artifact-persistence";

export type StudyArtifactRecord = {
  studyRunId: string;
  caseId: string;
  userId: string;
  rawProposalJson: unknown | null;
  validationResultJson: CanonicalStudyValidationResult | CanonicalStudyValidationResultV3;
  createdAt: string;
};

export interface StudyArtifactRepository {
  /** Inline canonical study: one insert with proposal + final validation. */
  save(record: Omit<StudyArtifactRecord, "createdAt">): Promise<void>;
  /** Worker propose step only. */
  saveProposed(record: Omit<StudyArtifactRecord, "createdAt">): Promise<void>;
  /** Worker validate step only. */
  saveValidated(record: Omit<StudyArtifactRecord, "createdAt">): Promise<void>;
  getByStudyRunId(studyRunId: string): Promise<StudyArtifactRecord | null>;
};

function toSaveInput(record: StudyArtifactRecord): {
  rawProposalJson: unknown | null;
  validationResultJson: CanonicalStudyValidationResultV3;
} {
  return {
    rawProposalJson: record.rawProposalJson,
    validationResultJson: record.validationResultJson as CanonicalStudyValidationResultV3,
  };
}

export class InMemoryStudyArtifactRepository implements StudyArtifactRepository {
  private readonly byRunId = new Map<string, StudyArtifactRecord>();

  private applyDecision(
    record: Omit<StudyArtifactRecord, "createdAt">,
    decide: (
      existing: {
        rawProposalJson: unknown | null;
        validationResultJson: CanonicalStudyValidationResultV3;
      } | null,
      incoming: {
        rawProposalJson: unknown | null;
        validationResultJson: CanonicalStudyValidationResultV3;
      },
    ) => StudyArtifactSaveDecision,
  ): void {
    const existing = this.byRunId.get(record.studyRunId);
    const decision = decide(
      existing ? toSaveInput(existing) : null,
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

  async save(record: Omit<StudyArtifactRecord, "createdAt">): Promise<void> {
    this.applyDecision(record, decideStudyArtifactSave);
  }

  async saveProposed(record: Omit<StudyArtifactRecord, "createdAt">): Promise<void> {
    this.applyDecision(record, decideProposeStudyArtifactSave);
  }

  async saveValidated(record: Omit<StudyArtifactRecord, "createdAt">): Promise<void> {
    this.applyDecision(record, (existing, incoming) =>
      decideValidateStudyArtifactSave(record.studyRunId, existing, incoming),
    );
  }

  async getByStudyRunId(studyRunId: string): Promise<StudyArtifactRecord | null> {
    return this.byRunId.get(studyRunId) ?? null;
  }
}
