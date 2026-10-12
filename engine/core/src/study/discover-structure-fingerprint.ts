import { createHash } from "node:crypto";

import type { StructureMap } from "@hiveforyou/shared/discover/structure-map";

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.keys(v as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = (v as Record<string, unknown>)[k];
          return acc;
        }, {});
    }
    return v;
  });
}

export function fingerprintDiscoverStudyMaterial(input: {
  domainId: string;
  presentSources: ReadonlyArray<{ sourceDocumentId: string; sha256: string }>;
  discoverPromptSha256: string;
  discoverPackVersion: string;
}): string {
  const sources = [...input.presentSources]
    .map((row) => ({
      sourceDocumentId: row.sourceDocumentId,
      sha256: row.sha256,
    }))
    .sort((a, b) => a.sourceDocumentId.localeCompare(b.sourceDocumentId));
  return createHash("sha256")
    .update(
      stableStringify({
        domainId: input.domainId,
        sources,
        discoverPromptSha256: input.discoverPromptSha256,
        discoverPackVersion: input.discoverPackVersion,
      }),
    )
    .digest("hex");
}

export function fingerprintStructureMap(structureMap: StructureMap): string {
  const logical = structureMap.logicalDocuments
    .map((doc) => ({
      id: doc.id,
      sourceDocumentId: doc.sourceDocumentId,
      documentType: doc.documentType,
      pageStart: doc.pageStart,
      pageEnd: doc.pageEnd,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return createHash("sha256")
    .update(stableStringify({ domainId: structureMap.domainResolution.domainId, logical }))
    .digest("hex");
}
