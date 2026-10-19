import type { DomainLearningCandidate } from "@hiveforyou/shared/domain-learning";

import { createDomainLearningCandidate } from "./learning-candidate";
import type { DomainLearningCandidateRepository } from "./repositories";

export type RecordAdHocIntakeLearningCandidateInput = {
  rawIntent: string | null;
  ephemeralSchemaId: string;
  intakeRunId: string;
  caseId: string;
};

/**
 * Append-only learning signal when intake resolves to GENERIC_STUDY (dynamic schema).
 * Does not mutate Domain Packs or promote ephemeral schemas automatically.
 */
export async function recordAdHocIntakeLearningCandidate(
  repo: DomainLearningCandidateRepository,
  input: RecordAdHocIntakeLearningCandidateInput,
): Promise<DomainLearningCandidate> {
  return createDomainLearningCandidate(repo, {
    domainId: "generic",
    candidateType: "ad_hoc_intake",
    subjectKey: input.ephemeralSchemaId,
    proposedLearning: {
      source: "ad_hoc_intake",
      rawIntent: input.rawIntent,
      ephemeralSchemaId: input.ephemeralSchemaId,
      intakeRunId: input.intakeRunId,
      caseId: input.caseId,
      reviewStatus: "pending_review",
    },
    supportingObservationIds: [],
  });
}
