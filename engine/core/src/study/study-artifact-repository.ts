import type { CanonicalStudyValidationResult } from "@hiveforyou/shared/canonical-study";
import type { CanonicalStudyValidationResultV3 } from "@hiveforyou/shared/case-intelligence/3/validation-result";

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
    this.byRunId.set(record.studyRunId, {
      ...record,
      createdAt: new Date().toISOString(),
    });
  }

  async getByStudyRunId(studyRunId: string): Promise<StudyArtifactRecord | null> {
    return this.byRunId.get(studyRunId) ?? null;
  }
}
