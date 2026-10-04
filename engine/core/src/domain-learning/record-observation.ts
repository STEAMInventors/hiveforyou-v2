import {
  DOMAIN_LEARNING_OBSERVATION_SCHEMA_VERSION,
  type DomainLearningObservation,
  type DomainLearningObservationType,
} from "@hiveforyou/shared/domain-learning";

import { newObservationId, type DomainLearningObservationRepository } from "./repositories";

export type RecordDomainLearningObservationInput = {
  domainId: string;
  domainPackId: string;
  domainPackVersion: string;
  caseId: string;
  studyRunId: string;
  observationType: DomainLearningObservationType;
  subjectKey: string;
  observationJson: Record<string, unknown>;
  questionId?: string | null;
  answerId?: string | null;
  sourceDocumentId?: string | null;
};

export async function recordDomainLearningObservation(
  repo: DomainLearningObservationRepository,
  input: RecordDomainLearningObservationInput,
): Promise<DomainLearningObservation> {
  const observation: DomainLearningObservation = {
    id: newObservationId(),
    domainId: input.domainId,
    domainPackId: input.domainPackId,
    domainPackVersion: input.domainPackVersion,
    caseId: input.caseId,
    studyRunId: input.studyRunId,
    observationType: input.observationType,
    subjectKey: input.subjectKey,
    observationJson: input.observationJson,
    observationSchemaVersion: DOMAIN_LEARNING_OBSERVATION_SCHEMA_VERSION,
    questionId: input.questionId ?? null,
    answerId: input.answerId ?? null,
    sourceDocumentId: input.sourceDocumentId ?? null,
    createdAt: new Date().toISOString(),
  };
  await repo.append(observation);
  return observation;
}
