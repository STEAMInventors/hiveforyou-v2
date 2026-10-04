import type { DocumentDiscoveryDocument } from "@/lib/document-discovery/types";
import { PROCESSING_STAGE_COUNT } from "@/lib/document-discovery/processing-stages";

import type { DocumentStructureMapReveal } from "@/lib/document-discovery/map-reveal-types";

export function buildMapRevealForStage(
  stageIndex: number,
  settled: boolean,
  documents: DocumentDiscoveryDocument[],
): DocumentStructureMapReveal {
  if (settled) {
    return {
      visibleDocumentIds: new Set(documents.map((doc) => doc.id)),
      showMissing: true,
      showRelationships: true,
    };
  }

  const count = documents.length;
  const stage = Math.min(stageIndex, PROCESSING_STAGE_COUNT - 1);

  let visibleCount = 0;
  if (stage >= 1) {
    visibleCount = Math.max(1, Math.ceil(count / 2));
  }
  if (stage >= 2) {
    visibleCount = count;
  }

  const visibleDocumentIds = new Set(
    documents.slice(0, visibleCount).map((doc) => doc.id),
  );

  return {
    visibleDocumentIds,
    showMissing: stage >= 3,
    showRelationships: stage >= 2,
  };
}
