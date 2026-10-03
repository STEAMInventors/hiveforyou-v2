import { describe, expect, it } from "vitest";

import { requireDiscoverPack } from "@hiveforyou/domain-packs";

const IEP_DISCOVER_PACK = requireDiscoverPack("iep");
import { HIVE_DISCOVER_RESOLUTION_SCHEMA } from "@hiveforyou/shared/discover";

import { buildStructureMap } from "./build-structure-map";
import { mapStructureMapToDocumentDiscovery } from "./map-structure-map-to-document-discovery";

const suggestions = {
  suggestedObjectives: [
    { id: "o1", label: "Understand the records", summary: "Read what was uploaded" },
    { id: "o2", label: "Prepare for a meeting", summary: "Focus on the next step" },
    { id: "o3", label: "Track timelines", summary: "See the sequence" },
  ],
  suggestedAudiences: [{ id: "a1", label: "Just for me", roleHint: "self" }],
};

describe("unregistered domain projection", () => {
  it("does not apply IEP completeness to a proposed tax domain", () => {
    const structureMap = buildStructureMap({
      discoverRunId: "run-1",
      caseId: "case-1",
      pack: IEP_DISCOVER_PACK,
      resolution: {
        schemaVersion: HIVE_DISCOVER_RESOLUTION_SCHEMA,
        domainResolution: {
          status: "MULTI_DOMAIN",
          domainLabel: "Multiple areas",
          candidateDomainLabels: ["Special education records", "Tax"],
        },
        logicalDocuments: [
          {
            id: "doc-iep",
            domainId: "iep",
            sourceDocumentId: "src-iep",
            pageStart: 1,
            documentType: "Individualized Education Program",
            title: "IEP",
            familyRole: "Service plan",
            groupId: "planning",
            recognitionStatus: "recognized",
          },
          {
            id: "doc-w2",
            domainId: "tax",
            sourceDocumentId: "src-w2",
            pageStart: 1,
            documentType: "Form W-2 Wage and Tax Statement",
            title: "W-2",
            familyRole: "Wage and tax record",
            groupId: "uploads",
            recognitionStatus: "proposed_type",
          },
        ],
        relationships: [],
        resolvedAmbiguityIds: [],
        unresolvedAmbiguityIds: [],
      },
      domainGroups: [
        {
          id: "iep",
          domainId: "iep",
          domainLabel: IEP_DISCOVER_PACK.domainLabel,
          logicalDocumentIds: ["doc-iep"],
          description: "Special education records",
          ...suggestions,
        },
        {
          id: "tax",
          domainId: "tax",
          domainLabel: "Tax",
          logicalDocumentIds: ["doc-w2"],
          description: "Tax records",
          ...suggestions,
        },
      ],
      sources: [
        { sourceDocumentId: "src-iep", originalFilename: "iep.pdf", sizeBytes: 1 },
        { sourceDocumentId: "src-w2", originalFilename: "w2.pdf", sizeBytes: 1 },
      ],
      customerAnswers: [],
      promptVersion: "discover-v2",
      promptSha256: "abc",
      providerId: "test",
    });

    const tax = structureMap.domainGroups?.find((group) => group.domainId === "tax");
    const iep = structureMap.domainGroups?.find((group) => group.domainId === "iep");
    expect(tax?.completeness.expectations).toEqual([]);
    expect(iep?.completeness.expectations.length).toBeGreaterThan(0);

    const discovery = mapStructureMapToDocumentDiscovery(structureMap, IEP_DISCOVER_PACK);
    const taxSection = discovery.domainSections?.find((section) => section.domainId === "tax");
    expect(taxSection?.documents.map((doc) => doc.id)).toEqual(["doc-w2"]);
    expect(taxSection?.missingDocuments).toEqual([]);
    expect(taxSection?.groups.some((group) => group.id === "uploads")).toBe(true);
  });
});