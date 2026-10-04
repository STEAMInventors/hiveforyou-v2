import type {

  DiscoverCollectionUnderstanding,

  HiveDiscoverProposalV2,

  ProposedAmbiguityCandidate,

} from "@hiveforyou/shared/discover";



import { enrichDomainGroupsWithCategories } from "./aggregate-domain-groups";



export function buildCollectionUnderstanding(

  proposal: HiveDiscoverProposalV2,

): DiscoverCollectionUnderstanding {

  return {

    domainResolutionStatus: proposal.domainResolution.status,

    domainGroups: enrichDomainGroupsWithCategories(

      proposal.domainGroups,

      proposal.logicalDocuments,

    ),

    unresolvedAmbiguitySummary: summarizeUnresolvedAmbiguity(proposal.ambiguityCandidates),

  };

}



function summarizeUnresolvedAmbiguity(candidates: ProposedAmbiguityCandidate[]): string | null {

  const consequential = candidates.filter((item) => item.affectsStructure);

  if (!consequential.length) {

    return null;

  }

  return consequential.map((item) => item.summary).join(" ");

}

