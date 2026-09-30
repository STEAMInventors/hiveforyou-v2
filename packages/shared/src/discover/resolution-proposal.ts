import type {
  ProposedDiscoverRelationship,
  ProposedDomainResolution,
  ProposedLogicalDocument,
} from "./proposal";

export const HIVE_DISCOVER_RESOLUTION_SCHEMA = "hive-discover-resolution/1" as const;

/**
 * Model proposal after customer structural assertions — validated before Structure Map.
 */
export type HiveDiscoverResolutionProposalV1 = {
  schemaVersion: typeof HIVE_DISCOVER_RESOLUTION_SCHEMA;
  domainResolution: ProposedDomainResolution;
  logicalDocuments: ProposedLogicalDocument[];
  relationships: ProposedDiscoverRelationship[];
  /** Resolved ambiguity ids from the discovery assessment. */
  resolvedAmbiguityIds: string[];
  unresolvedAmbiguityIds: string[];
};
