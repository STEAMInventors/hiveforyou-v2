import type { DiscoverDomainPackSnapshot } from "@hiveforyou/domain-packs";
import { discoverPackForDomain, getDiscoverPackByDomainId } from "@hiveforyou/domain-packs";
import type { DocumentDiscoveryResult } from "@hiveforyou/shared/discovery";
import type { StructureMap, StructureMapDomainGroup } from "@hiveforyou/shared/discover";
import { isResolvedDomainStatus } from "@hiveforyou/shared/discover";
import { dedupeCompletenessExpectations } from "./check-pack-completeness";

export function assertUniquePrimaryInventory(
  sections: Array<{ documents: Array<{ id: string }> }>,
): void {
  const seen = new Set<string>();
  for (const section of sections) {
    for (const doc of section.documents) {
      if (seen.has(doc.id)) {
        throw new Error(`DUPLICATE_LOGICAL_DOCUMENT:${doc.id}`);
      }
      seen.add(doc.id);
    }
  }
}

function mapDocumentsForPack(
  structureMap: StructureMap,
  pack: DiscoverDomainPackSnapshot,
  logicalDocumentIds?: string[],
) {
  const allowed = logicalDocumentIds ? new Set(logicalDocumentIds) : null;
  const sourceById = new Map(
    structureMap.sourceDocuments.map((doc) => [doc.sourceDocumentId, doc]),
  );

  const seen = new Set<string>();
  return structureMap.logicalDocuments
    .filter((doc) => (allowed ? allowed.has(doc.id) : true))
    .filter((doc) => {
      if (seen.has(doc.id)) {
        throw new Error(`DUPLICATE_LOGICAL_DOCUMENT:${doc.id}`);
      }
      seen.add(doc.id);
      return true;
    })
    .map((doc) => {
      const source = sourceById.get(doc.sourceDocumentId);
      return {
        id: doc.id,
        stagedDocumentId: doc.sourceDocumentId,
        documentType: doc.documentType,
        title: doc.title,
        documentDate: doc.documentDate,
        originalFilename: source?.originalFilename ?? "unknown",
        sizeBytes: source?.sizeBytes ?? 0,
        pageCount: doc.pageEnd != null ? doc.pageEnd - doc.pageStart + 1 : undefined,
        familyRole: doc.familyRole,
        sequenceOrder: doc.sequenceOrder,
        groupId: doc.groupId,
        recognitionStatus: doc.recognitionStatus,
      };
    });
}

function groupsForSection(
  pack: DiscoverDomainPackSnapshot,
  documents: Array<{ groupId: string }>,
) {
  const groups = structuredClone(pack.groups);
  if (getDiscoverPackByDomainId(pack.domainId)) {
    return groups;
  }
  const known = new Set(groups.map((group) => group.id));
  for (const doc of documents) {
    if (!doc.groupId || known.has(doc.groupId)) {
      continue;
    }
    known.add(doc.groupId);
    groups.push({
      id: doc.groupId,
      label: "Uploaded documents",
      description: "Documents in this area",
      sequenceOrder: groups.length + 1,
    });
  }
  return groups;
}

function mapMissingForGroup(
  structureMap: StructureMap,
  pack: DiscoverDomainPackSnapshot,
  group?: StructureMapDomainGroup,
) {
  const expectations = dedupeCompletenessExpectations(
    group?.completeness.expectations ??
      structureMap.completeness.expectations.filter((item) =>
        pack.missingExpectations.some(
          (expectation) => expectation.packExpectationId === item.packExpectationId,
        ),
      ),
  );

  return expectations
    .filter((item) => item.state === "MISSING")
    .map((item) => {
      const packExpectation = pack.missingExpectations.find(
        (expectation) => expectation.packExpectationId === item.packExpectationId,
      );
      return {
        id: packExpectation?.id ?? item.packExpectationId,
        expectedDocumentType: item.expectedDocumentType,
        familyRole: packExpectation?.familyRole ?? "Expected document",
        groupId: packExpectation?.groupId ?? pack.groups[0]?.id ?? "planning",
        reasonExpected:
          packExpectation?.reasonExpected ??
          "Expected by the active Domain Pack completeness rules.",
        sequenceOrder: packExpectation?.sequenceOrder,
      };
    });
}

export function mapStructureMapToDocumentDiscovery(
  structureMap: StructureMap,
  pack: DiscoverDomainPackSnapshot,
): DocumentDiscoveryResult {
  const domainResolutionStatus = isResolvedDomainStatus(structureMap.domainResolution.status)
    ? "resolved"
    : "provisional";

  const domainSections =
    structureMap.domainGroups?.map((group) => {
      const groupPack = discoverPackForDomain(group.domainId, group.domainLabel);
      const documents = mapDocumentsForPack(structureMap, groupPack, group.logicalDocumentIds);
      return {
        domainId: group.domainId,
        domainLabel: group.domainLabel,
        description: group.description,
        groups: groupsForSection(groupPack, documents),
        documentCategories: group.documentCategories,
        documents,
        missingDocuments: mapMissingForGroup(structureMap, groupPack, group),
      };
    }) ?? undefined;

  if (domainSections && domainSections.length > 0) {
    assertUniquePrimaryInventory(domainSections);
    const documents = domainSections.flatMap((section) => section.documents);
    const single = domainSections.length === 1 ? domainSections[0] : undefined;
    return {
      domainLabel: structureMap.domainResolution.domainLabel,
      domainResolutionStatus,
      groups: single ? structuredClone(single.groups) : [],
      documents,
      relationships: structureMap.relationships.map((rel) => ({
        id: rel.id,
        fromDocumentId: rel.fromLogicalDocumentId,
        toDocumentId: rel.toLogicalDocumentId,
        kind: rel.kind,
        label: rel.label,
      })),
      missingDocuments: single ? structuredClone(single.missingDocuments) : [],
      domainSections,
    };
  }

  const missingDocuments = mapMissingForGroup(structureMap, pack);

  return {
    domainLabel: structureMap.domainResolution.domainLabel,
    domainResolutionStatus,
    groups: structuredClone(pack.groups),
    documents: mapDocumentsForPack(structureMap, pack),
    relationships: structureMap.relationships.map((rel) => ({
      id: rel.id,
      fromDocumentId: rel.fromLogicalDocumentId,
      toDocumentId: rel.toLogicalDocumentId,
      kind: rel.kind,
      label: rel.label,
    })),
    missingDocuments,
    domainSections,
  };
}
