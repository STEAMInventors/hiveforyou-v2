import type { CanonicalStudyProposalV2 } from "@hiveforyou/shared/canonical-study";

export function isCanonicalStudyTestEnvironment(): boolean {
  return process.env.NODE_ENV === "test";
}

export function isFixtureProposal(proposal: CanonicalStudyProposalV2): boolean {
  return proposal.modelMetadata.proposalMode === "fixture";
}

export function fixturePersistenceBlocked(proposal: CanonicalStudyProposalV2): boolean {
  return isFixtureProposal(proposal) && !isCanonicalStudyTestEnvironment();
}
