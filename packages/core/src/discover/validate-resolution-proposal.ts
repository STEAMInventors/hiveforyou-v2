import type { HiveDiscoverResolutionProposalV1 } from "@hiveforyou/shared/discover";
import { HIVE_DISCOVER_RESOLUTION_SCHEMA } from "@hiveforyou/shared/discover";
import type { HiveDiscoverValidationResult } from "@hiveforyou/shared/discover";

import type { DiscoverSourceDocumentInput } from "./types";
import { resolveActiveDiscoverPack } from "./validate-discovery-proposal";
import { validateStructuralDiscoveryProposal } from "./validate-structural-proposal";

function isResolutionShape(value: unknown): value is HiveDiscoverResolutionProposalV1 {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return (value as { schemaVersion?: string }).schemaVersion === HIVE_DISCOVER_RESOLUTION_SCHEMA;
}

export function validateResolutionProposal(
  raw: unknown,
  sources: DiscoverSourceDocumentInput[],
): HiveDiscoverValidationResult {
  if (!isResolutionShape(raw)) {
    return {
      ok: false,
      issues: [
        {
          code: "MALFORMED_PROPOSAL",
          message: "Resolution proposal is missing or has an invalid schema version.",
        },
      ],
    };
  }

  const pack = resolveActiveDiscoverPack({
    schemaVersion: "hive-discover-proposal/1",
    domainResolution: raw.domainResolution,
    logicalDocuments: raw.logicalDocuments,
    relationships: raw.relationships,
    missingExpectedDocuments: [],
  });

  return validateStructuralDiscoveryProposal(
    {
      domainResolution: raw.domainResolution,
      logicalDocuments: raw.logicalDocuments,
      relationships: raw.relationships,
    },
    sources,
    pack,
  );
}
