import type { StructureMap } from "@hiveforyou/shared/discover/structure-map";

import { loadLatestStructureMapForCase } from "../persistence/supabase-case-projections.js";
import type { HiveGateway } from "../persistence/hive-gateway.js";

export type Engine1ReaderContextProvenance =
  | "persisted_discover_structure_map"
  | "intake_pack_execution"
  | "test_only_minimal";

export type Engine1ReaderContextLogicalDocument = {
  sourceDocumentId: string;
  filename?: string;
  pageCount?: number;
  logicalDocumentId?: string;
  pageStart?: number;
  pageEnd?: number;
};

export type Engine1ReaderContext = {
  provenance: Engine1ReaderContextProvenance;
  resolvedDomainId: string;
  domainPackId: string;
  domainPackVersion: string;
  logicalDocuments: Engine1ReaderContextLogicalDocument[];
  notes?: string[];
};

export class Engine1ReaderContextError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "Engine1ReaderContextError";
  }
}

function mapLogicalDocuments(input: {
  structureMap: StructureMap;
  filenameBySourceDocumentId?: ReadonlyMap<string, string>;
  pageCountBySourceDocumentId?: ReadonlyMap<string, number>;
}): Engine1ReaderContextLogicalDocument[] {
  return input.structureMap.logicalDocuments.map((doc) => ({
    sourceDocumentId: doc.sourceDocumentId,
    logicalDocumentId: doc.id,
    pageStart: doc.pageStart,
    pageEnd: doc.pageEnd,
    filename: input.filenameBySourceDocumentId?.get(doc.sourceDocumentId),
    pageCount: input.pageCountBySourceDocumentId?.get(doc.sourceDocumentId),
  }));
}

function readerContextProvenance(structureMap: StructureMap): Engine1ReaderContextProvenance {
  if (structureMap.provenance?.providerId === "intake-domain-pack") {
    return "intake_pack_execution";
  }
  return "persisted_discover_structure_map";
}

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
  /** When set, use this structure map instead of loading from persistence. */
  structureMap?: StructureMap | null;
  /** Production pack-driven path: fail closed without a persisted structure map (Intake or Discover). */
  requirePersistedDiscover?: boolean;
}): Promise<Engine1ReaderContext> {
  const structureMap: StructureMap | null =
    input.structureMap ??
    (await loadLatestStructureMapForCase(input.gateway, input.userId, input.caseId));

  if (structureMap?.logicalDocuments?.length) {
    const logicalDocuments = mapLogicalDocuments({
      structureMap,
      filenameBySourceDocumentId: input.filenameBySourceDocumentId,
      pageCountBySourceDocumentId: input.pageCountBySourceDocumentId,
    });
    const provenance = readerContextProvenance(structureMap);
    return {
      provenance,
      resolvedDomainId: structureMap.domainResolution.domainId ?? input.domainId,
      domainPackId: input.domainPackId,
      domainPackVersion: input.domainPackVersion,
      logicalDocuments,
      notes: [
        provenance === "intake_pack_execution"
          ? "logicalDocuments sourced from Intake pack execution (boundaries and provenance only; no document-type hints for Reader)."
          : "logicalDocuments sourced from persisted structure map (boundaries and provenance only; no document-type hints for Reader).",
      ],
    };
  }

  if (input.requirePersistedDiscover) {
    throw new Engine1ReaderContextError(
      "Persisted Discover structure map is required for this study path.",
      "DISCOVER_STRUCTURE_MAP_REQUIRED",
    );
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
