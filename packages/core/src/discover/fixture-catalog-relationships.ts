import type { HiveDiscoverProposalV1 } from "@hiveforyou/shared/discover";
import { IEP_DISCOVER_PACK } from "@hiveforyou/domain-packs";

/** Deterministic relationship template keyed by catalog ids (fixture only). */
export function buildFixtureRelationships(
  catalogIdToLogicalId: Map<string, string>,
): HiveDiscoverProposalV1["relationships"] {
  const rel = (
    id: string,
    fromCatalogId: string,
    toCatalogId: string,
    kind: HiveDiscoverProposalV1["relationships"][number]["kind"],
    label?: string,
  ): HiveDiscoverProposalV1["relationships"][number] | null => {
    const from = catalogIdToLogicalId.get(fromCatalogId);
    const to = catalogIdToLogicalId.get(toCatalogId);
    if (!from || !to) {
      return null;
    }
    return {
      id,
      fromLogicalDocumentId: from,
      toLogicalDocumentId: to,
      kind,
      label,
    };
  };

  return [
    rel("rel-eval-to-iep", "psycho-eval", "iep", "precedes", "Evaluation informs plan"),
    rel("rel-iep-to-progress", "iep", "progress-report", "precedes", "Plan precedes progress"),
    rel("rel-speech-supports-psycho", "speech-eval", "psycho-eval", "supports", "Related evaluations"),
  ].filter((item): item is HiveDiscoverProposalV1["relationships"][number] => item !== null);
}

export function fixtureMissingDocuments(): HiveDiscoverProposalV1["missingExpectedDocuments"] {
  return IEP_DISCOVER_PACK.missingExpectations.map((item) => ({
    id: item.id,
    packExpectationId: item.packExpectationId,
    expectedDocumentType: item.expectedDocumentType,
    familyRole: item.familyRole,
    groupId: item.groupId,
    reasonExpected: item.reasonExpected,
    sequenceOrder: item.sequenceOrder,
  }));
}
