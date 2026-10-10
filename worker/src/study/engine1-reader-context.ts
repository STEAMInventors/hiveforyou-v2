import type { StructureMap } from "@hiveforyou/shared/discover/structure-map";

import { loadLatestStructureMapForCase } from "../persistence/supabase-case-projections.js";
import type { HiveGateway } from "../persistence/hive-gateway.js";

export type Engine1ReaderContextProvenance =
  | "persisted_discover_structure_map"
  | "test_only_minimal";

export type Engine1ReaderContext = {
  provenance: Engine1ReaderContextProvenance;
  resolvedDomainId: string;
  domainPackId: string;
  domainPackVersion: string;
  logicalDocuments: Array<{
    sourceDocumentId: string;
    filename?: string;
    pageCount?: number;
    logicalDocumentId?: string;
    documentType?: string;
    pageStart?: number;
    pageEnd?: number;
  }>;
  notes?: string[];
};

export async function resolveEngine1ReaderContext(input: {
  gateway: HiveGateway;
  userId: string;
  caseId: string;
  domainId: string;
  domainPackId: string;
  domainPackVersion: string;
  registeredDocuments: ReadonlyArray<{ id: string; sha256: string; filename?: string }>;
  filenameBySourceDocumentId?: ReadonlyMap<string, string>;
  pageCountBySourceDocumentId?: ReadonlyMap<string, number>;
}): Promise<Engine1ReaderContext> {
  const structureMap: StructureMap | null = await loadLatestStructureMapForCase(
    input.gateway,
    input.userId,
    input.caseId,
  );

  if (structureMap?.logicalDocuments?.length) {
    const logicalDocuments = structureMap.logicalDocuments.map((doc) => ({
      sourceDocumentId: doc.sourceDocumentId,
      logicalDocumentId: doc.id,
      documentType: doc.documentType,
      pageStart: doc.pageStart,
      pageEnd: doc.pageEnd,
      filename: input.filenameBySourceDocumentId?.get(doc.sourceDocumentId),
      pageCount: input.pageCountBySourceDocumentId?.get(doc.sourceDocumentId),
    }));
    return {
      provenance: "persisted_discover_structure_map",
      resolvedDomainId: structureMap.domainId ?? input.domainId,
      domainPackId: input.domainPackId,
      domainPackVersion: input.domainPackVersion,
      logicalDocuments,
      notes: [
        "logicalDocuments sourced from hive.discover_artifacts.structure_map_json (latest row for case).",
      ],
    };
  }

  const logicalDocuments = input.registeredDocuments.map((doc) => ({
    sourceDocumentId: doc.id,
    filename:
      input.filenameBySourceDocumentId?.get(doc.id) ??
      doc.filename ??
      undefined,
    pageCount: input.pageCountBySourceDocumentId?.get(doc.id),
  }));

  return {
    provenance: "test_only_minimal",
    resolvedDomainId: input.domainId,
    domainPackId: input.domainPackId,
    domainPackVersion: input.domainPackVersion,
    logicalDocuments,
    notes: [
      "TEST_ONLY: no persisted discover structure map for this case.",
      "Fields limited to registered sourceDocumentId, optional corpus filename (SHA map), and page counts from loaded document-pages.",
      "No Engine 1 documentType, logicalDocumentId, or page boundaries were invented.",
    ],
  };
}

export function serializeEngine1ReaderContext(context: Engine1ReaderContext): string {
  return JSON.stringify(context);
}
