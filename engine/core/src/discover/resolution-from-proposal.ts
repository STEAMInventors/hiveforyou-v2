import type {
  HiveDiscoverProposalV2,
  HiveDiscoverResolutionProposalV1,
} from "@hiveforyou/shared/discover";
import { HIVE_DISCOVER_RESOLUTION_SCHEMA } from "@hiveforyou/shared/discover";

export function resolutionFromValidatedProposal(
  proposal: HiveDiscoverProposalV2,
): HiveDiscoverResolutionProposalV1 {
  return {
    schemaVersion: HIVE_DISCOVER_RESOLUTION_SCHEMA,
    domainResolution: proposal.domainResolution,
    logicalDocuments: proposal.logicalDocuments,
    relationships: proposal.relationships,
    resolvedAmbiguityIds: [],
    unresolvedAmbiguityIds: [],
  };
}
