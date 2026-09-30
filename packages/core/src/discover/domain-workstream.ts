import type { DiscoverDomainPackSnapshot } from "@hiveforyou/domain-packs";
import type { CaseCustomerContextSnapshot, Engine2DomainCustomerContext } from "@hiveforyou/shared/case-customer-context";
import type { DocumentDiscoveryResult } from "@hiveforyou/shared/discovery";
import type { StructureMap } from "@hiveforyou/shared/discover";

import { customerContextForEngine2 } from "../persistence/case-customer-context-repository";

export function scopeDiscoveryResultToDomain(
  discovery: DocumentDiscoveryResult,
  domainId: string,
): DocumentDiscoveryResult {
  const section = discovery.domainSections?.find((item) => item.domainId === domainId);
  if (!section) {
    return discovery;
  }
  const ids = new Set(section.documents.map((doc) => doc.id));
  return {
    ...discovery,
    domainLabel: section.domainLabel,
    groups: structuredClone(section.groups),
    documents: structuredClone(section.documents),
    missingDocuments: structuredClone(section.missingDocuments),
    relationships: discovery.relationships.filter(
      (rel) => ids.has(rel.fromDocumentId) && ids.has(rel.toDocumentId),
    ),
    domainSections: [structuredClone(section)],
  };
}

export type DomainEngine2Workstream = {
  domainId: string;
  domainPackId: string;
  domainPackVersion: string;
  documents: DocumentDiscoveryResult["documents"];
  structureMap: StructureMap | undefined;
  customerContext: Engine2DomainCustomerContext | undefined;
};

/**
 * Engine 2 input for one domain. Objective may guide emphasis.
 * Audience and share intent are not included.
 */
export function buildDomainEngine2Workstream(input: {
  domainId: string;
  structureMap?: StructureMap;
  documentDiscovery: DocumentDiscoveryResult;
  customerContext: CaseCustomerContextSnapshot | null;
  pack: DiscoverDomainPackSnapshot;
}): DomainEngine2Workstream {
  const discovery = scopeDiscoveryResultToDomain(input.documentDiscovery, input.domainId);
  const group = input.structureMap?.domainGroups?.find((item) => item.domainId === input.domainId);
  const structureMap = input.structureMap
    ? {
        ...input.structureMap,
        domainResolution: {
          ...input.structureMap.domainResolution,
          status: "SINGLE_DOMAIN" as const,
          domainId: input.pack.domainId,
          domainLabel: input.pack.domainLabel,
          domainPackId: input.pack.domainPackId,
          domainPackVersion: input.pack.domainPackVersion,
        },
        domainGroups: group ? [group] : [],
        logicalDocuments: input.structureMap.logicalDocuments.filter((doc) =>
          group ? group.logicalDocumentIds.includes(doc.id) : doc.domainId === input.domainId,
        ),
      }
    : undefined;

  return {
    domainId: input.domainId,
    domainPackId: input.pack.domainPackId,
    domainPackVersion: input.pack.domainPackVersion,
    documents: discovery.documents,
    structureMap,
    customerContext: customerContextForEngine2(input.customerContext, input.domainId),
  };
}
