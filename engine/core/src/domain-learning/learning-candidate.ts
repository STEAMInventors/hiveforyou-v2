import { randomUUID } from "node:crypto";

import type { DomainLearningCandidate } from "@hiveforyou/shared/domain-learning";

import type { DomainLearningCandidateRepository } from "./repositories";

/**
 * Persists a proposed learning candidate for human review.
 * Does not read or modify Domain Pack artifacts.
 */
export async function createDomainLearningCandidate(
  repo: DomainLearningCandidateRepository,
  input: {
    domainId: string;
    candidateType: string;
    subjectKey: string;
    proposedLearning: Record<string, unknown>;
    supportingObservationIds: string[];
    sourceDomainPackId?: string | null;
    sourceDomainPackVersion?: string | null;
  },
): Promise<DomainLearningCandidate> {
  const candidate: DomainLearningCandidate = {
    id: randomUUID(),
    domainId: input.domainId,
    candidateType: input.candidateType,
    subjectKey: input.subjectKey,
    proposedLearning: input.proposedLearning,
    supportingObservationCount: input.supportingObservationIds.length,
    status: "PROPOSED",
    createdAt: new Date().toISOString(),
    sourceDomainPackId: input.sourceDomainPackId ?? null,
    sourceDomainPackVersion: input.sourceDomainPackVersion ?? null,
    supportingObservationIds: [...input.supportingObservationIds],
  };
  await repo.insert(candidate);
  return candidate;
}
