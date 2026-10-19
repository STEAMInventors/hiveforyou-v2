import { domainPackRecordId } from "@hiveforyou/domain-pack";
import type { DiscoverDomainPackSnapshot } from "@hiveforyou/domain-packs";

import type { MappingPackDiscoverView } from "./types.js";

export function discoverViewToPackSnapshot(
  view: MappingPackDiscoverView,
  manifest: { id: string; name: string; packVersion: string },
): DiscoverDomainPackSnapshot {
  return {
    domainId: view.domainId,
    domainPackId: domainPackRecordId(view.packPin.packId),
    domainPackVersion: view.packPin.packVersion,
    domainLabel: manifest.name,
    groups: view.groups,
    documentTypes: [...view.documentTypes],
    familyRoles: [...view.familyRoles],
    relationshipKinds: [...view.relationshipKinds],
    catalog: [],
    missingExpectations: [],
  };
}
