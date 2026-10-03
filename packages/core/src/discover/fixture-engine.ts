import { requireDiscoverPack } from "@hiveforyou/domain-packs";

const IEP_DISCOVER_PACK = requireDiscoverPack("iep");
import type { HiveDiscoverProposalV1 } from "@hiveforyou/shared/discover";
import { HIVE_DISCOVER_PROPOSAL_SCHEMA } from "@hiveforyou/shared/discover";

import type { DiscoverEngine, DiscoverEngineContext } from "./engine";
import {
  buildFixtureRelationships,
  fixtureMissingDocuments,
} from "./fixture-catalog-relationships";

function matchCatalog(filename: string) {
  const normalized = filename.toLowerCase();
  for (const entry of IEP_DISCOVER_PACK.catalog) {
    if (entry.filenameHints.some((hint) => normalized.includes(hint.toLowerCase()))) {
      return entry;
    }
  }
  return null;
}

/**
 * Deterministic fixture — mirrors V2-001C client adapter behavior for tests.
 */
export class FixtureDiscoverEngine implements DiscoverEngine {
  async discover(context: DiscoverEngineContext): Promise<HiveDiscoverProposalV1> {
    const usedCatalogIds = new Set<string>();
    const catalogIdToLogicalId = new Map<string, string>();
    const logicalDocuments: HiveDiscoverProposalV1["logicalDocuments"] = [];

    context.sourceDocuments.forEach((source, index) => {
      let catalog = matchCatalog(source.originalFilename);
      if (catalog && usedCatalogIds.has(catalog.catalogId)) {
        catalog = null;
      }
      if (catalog) {
        usedCatalogIds.add(catalog.catalogId);
      }

      const recognitionStatus =
        catalog != null
          ? "recognized"
          : index === 0
            ? "ambiguous"
            : "unrecognized";

      const logicalId = `doc-${source.sourceDocumentId}`;
      if (catalog) {
        catalogIdToLogicalId.set(catalog.catalogId, logicalId);
      }

      logicalDocuments.push({
        id: logicalId,
        sourceDocumentId: source.sourceDocumentId,
        pageStart: 1,
        documentType: catalog?.documentType ?? "Document (unclassified)",
        title:
          catalog?.title ??
          (source.originalFilename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() ||
            source.originalFilename),
        documentDate: catalog?.defaultDate,
        familyRole: catalog?.familyRole ?? "Uploaded file",
        groupId: catalog?.groupId ?? "planning",
        sequenceOrder: catalog?.sequenceOrder ?? 100 + index,
        recognitionStatus,
      });
    });

    const hasAmbiguousDoc = logicalDocuments.some(
      (doc) => doc.recognitionStatus === "ambiguous",
    );

    return {
      schemaVersion: HIVE_DISCOVER_PROPOSAL_SCHEMA,
      domainResolution: {
        status: hasAmbiguousDoc ? "AMBIGUOUS" : "RESOLVED",
        domainLabel: IEP_DISCOVER_PACK.domainLabel,
      },
      logicalDocuments,
      relationships: buildFixtureRelationships(catalogIdToLogicalId),
      missingExpectedDocuments: fixtureMissingDocuments(),
    };
  }
}
