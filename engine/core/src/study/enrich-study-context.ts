import { buildDomainEngine2Workstream } from "../discover/domain-workstream";
import { getDiscoverPackByDomainId } from "@hiveforyou/domain-packs";
import type { CaseCustomerContextSnapshot } from "@hiveforyou/shared/case-customer-context";
import type { CanonicalStudyContext } from "@hiveforyou/shared/canonical-study";
import type { StructureMap } from "@hiveforyou/shared/discover";
import type { DocumentDiscoveryResult } from "@hiveforyou/shared/discovery";

function sourceIdentityKeys(
  doc: CanonicalStudyContext["sourceDocuments"][number],
): string[] {
  const keys = [doc.stagedDocumentId];
  if (doc.sourceDocumentId) {
    keys.push(doc.sourceDocumentId);
  }
  if (doc.discoveryDocumentId) {
    keys.push(doc.discoveryDocumentId);
  }
  return keys;
}

/**
 * Attaches a domain-scoped Structure Map slice and logical documents for strict provenance.
 */
export function enrichStudyContextWithStructureMap(input: {
  context: CanonicalStudyContext;
  structureMap: StructureMap;
  engine1Result: DocumentDiscoveryResult;
  customerContext?: CaseCustomerContextSnapshot | null;
}): CanonicalStudyContext {
  const pack = getDiscoverPackByDomainId(input.context.domainId);
  if (!pack) {
    return input.context;
  }
  const workstream = buildDomainEngine2Workstream({
    domainId: input.context.domainId,
    structureMap: input.structureMap,
    documentDiscovery: input.engine1Result,
    customerContext: input.customerContext ?? null,
    pack,
  });
  const logicalDocuments = workstream.structureMap?.logicalDocuments ?? [];
  if (!logicalDocuments.length) {
    return {
      ...input.context,
      structureMap: workstream.structureMap,
      logicalDocuments: [],
    };
  }

  const allowedSourceIds = new Set(
    logicalDocuments.map((doc) => doc.sourceDocumentId),
  );
  const scopedSources = input.context.sourceDocuments.filter((doc) =>
    sourceIdentityKeys(doc).some((key) => allowedSourceIds.has(key)),
  );

  return {
    ...input.context,
    structureMap: workstream.structureMap,
    logicalDocuments,
    sourceDocuments:
      scopedSources.length > 0 ? scopedSources : input.context.sourceDocuments,
  };
}
