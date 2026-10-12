import {
  DiscoverDocumentTypeResolutionError,
  resolveProposalDocumentTypeIdFromDiscoverLabel,
  type ProposalDomainPack,
} from "@hiveforyou/domain-pack";
import type { StructureMap } from "@hiveforyou/shared/discover/structure-map";

import { loadLatestStructureMapForCase } from "../persistence/supabase-case-projections.js";
import type { HiveGateway } from "../persistence/hive-gateway.js";

export type Engine1ReaderContextProvenance =
  | "persisted_discover_structure_map"
  | "test_only_minimal";

export type Engine1ReaderContextLogicalDocument = {
  sourceDocumentId: string;
  filename?: string;
  pageCount?: number;
  logicalDocumentId?: string;
  /** Discover vocabulary label from the structure map. */
  documentType?: string;
  /** Stable pack document type id for pack-driven Reader checklists. */
  documentTypeId?: string;
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
  proposalPack: ProposalDomainPack | null;
  requireClassifications: boolean;
  filenameBySourceDocumentId?: ReadonlyMap<string, string>;
  pageCountBySourceDocumentId?: ReadonlyMap<string, number>;
}): Engine1ReaderContextLogicalDocument[] {
  return input.structureMap.logicalDocuments.map((doc) => {
    const discoverLabel = doc.documentType?.trim() ?? "";
    let documentTypeId: string | undefined;
    if (input.requireClassifications && !discoverLabel) {
      throw new Engine1ReaderContextError(
        `Missing documentType for logical document ${doc.id}.`,
        "ENGINE1_MISSING_DOCUMENT_CLASSIFICATION",
      );
    }
    if (input.proposalPack && discoverLabel) {
      try {
        documentTypeId = resolveProposalDocumentTypeIdFromDiscoverLabel(
          input.proposalPack,
          discoverLabel,
        );
      } catch (error) {
        if (error instanceof DiscoverDocumentTypeResolutionError && input.requireClassifications) {
          throw new Engine1ReaderContextError(error.message, "ENGINE1_UNKNOWN_DOCUMENT_CLASSIFICATION");
        }
        throw error;
      }
    } else if (input.requireClassifications && discoverLabel) {
      throw new Engine1ReaderContextError(
        `Could not resolve document type for label ${discoverLabel}.`,
        "ENGINE1_UNKNOWN_DOCUMENT_CLASSIFICATION",
      );
    }
    return {
      sourceDocumentId: doc.sourceDocumentId,
      logicalDocumentId: doc.id,
      documentType: discoverLabel || undefined,
      documentTypeId,
      pageStart: doc.pageStart,
      pageEnd: doc.pageEnd,
      filename: input.filenameBySourceDocumentId?.get(doc.sourceDocumentId),
      pageCount: input.pageCountBySourceDocumentId?.get(doc.sourceDocumentId),
    };
  });
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
  proposalPack?: ProposalDomainPack | null;
  /** Production pack-driven path: fail closed without Discover map and classifications. */
  requirePersistedDiscover?: boolean;
}): Promise<Engine1ReaderContext> {
  const structureMap: StructureMap | null =
    input.structureMap ??
    (await loadLatestStructureMapForCase(input.gateway, input.userId, input.caseId));

  if (structureMap?.logicalDocuments?.length) {
    const requireClassifications = Boolean(input.requirePersistedDiscover || input.proposalPack);
    const logicalDocuments = mapLogicalDocuments({
      structureMap,
      proposalPack: input.proposalPack ?? null,
      requireClassifications,
      filenameBySourceDocumentId: input.filenameBySourceDocumentId,
      pageCountBySourceDocumentId: input.pageCountBySourceDocumentId,
    });
    return {
      provenance: "persisted_discover_structure_map",
      resolvedDomainId: structureMap.domainResolution.domainId ?? input.domainId,
      domainPackId: input.domainPackId,
      domainPackVersion: input.domainPackVersion,
      logicalDocuments,
      notes: [
        "logicalDocuments sourced from hive.discover_artifacts.structure_map_json (latest row for case).",
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
