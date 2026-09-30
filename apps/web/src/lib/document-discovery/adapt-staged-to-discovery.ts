import type { StagedDocument } from "@/lib/staged-documents";

import {
  buildTemplateRelationships,
  DISCOVERY_DOCUMENT_CATALOG,
  DISCOVERY_DOMAIN_LABEL,
  DISCOVERY_TEMPLATE_GROUPS,
  DISCOVERY_TEMPLATE_MISSING,
} from "./fixture-template";
import type {
  DocumentDiscoveryDocument,
  DocumentDiscoveryResult,
  RecognitionStatus,
} from "./types";

function matchCatalog(filename: string) {
  const normalized = filename.toLowerCase();
  for (const entry of DISCOVERY_DOCUMENT_CATALOG) {
    if (entry.filenameHints.some((hint) => hint.test(normalized))) {
      return entry;
    }
  }
  return null;
}

function titleFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
  return base.trim() || filename;
}

type BuiltDocument = DocumentDiscoveryDocument & {
  catalogId?: string;
};

function buildDocumentFromStaged(
  staged: StagedDocument,
  catalogMatch: (typeof DISCOVERY_DOCUMENT_CATALOG)[number] | null,
  index: number,
): BuiltDocument {
  const recognitionStatus: RecognitionStatus = catalogMatch
    ? "recognized"
    : index === 0 && staged.file.name.length > 0
      ? "ambiguous"
      : "unrecognized";

  const groupId = catalogMatch?.groupId ?? "planning";
  const documentType = catalogMatch?.documentType ?? "Document (unclassified)";

  return {
    id: `doc-${staged.id}`,
    catalogId: catalogMatch?.catalogId,
    stagedDocumentId: staged.id,
    documentType,
    title: catalogMatch?.title ?? titleFromFilename(staged.file.name),
    documentDate: catalogMatch?.defaultDate,
    originalFilename: staged.file.name,
    sizeBytes: staged.file.size,
    pageCount: undefined,
    familyRole: catalogMatch?.familyRole ?? "Uploaded file",
    sequenceOrder: catalogMatch?.sequenceOrder ?? 100 + index,
    groupId,
    recognitionStatus,
  };
}

/**
 * Maps client-staged uploads to an Engine 1-shaped discovery payload.
 * Swap this function for a real Engine 1 client when available.
 */
export function adaptStagedDocumentsToDiscovery(
  staged: StagedDocument[],
): DocumentDiscoveryResult {
  const usedCatalogIds = new Set<string>();
  const built: BuiltDocument[] = staged.map((item, index) => {
    let catalog = matchCatalog(item.file.name);
    if (catalog && usedCatalogIds.has(catalog.catalogId)) {
      catalog = null;
    }
    if (catalog) {
      usedCatalogIds.add(catalog.catalogId);
    }
    return buildDocumentFromStaged(item, catalog, index);
  });

  const catalogIdToDocId = new Map<string, string>();
  for (const doc of built) {
    if (doc.catalogId) {
      catalogIdToDocId.set(doc.catalogId, doc.id);
    }
  }

  const documents: DocumentDiscoveryDocument[] = built.map((doc) => {
    const { catalogId: _unused, ...rest } = doc;
    void _unused;
    return rest;
  });

  return {
    domainLabel: DISCOVERY_DOMAIN_LABEL,
    domainResolutionStatus: documents.some((d) => d.recognitionStatus === "ambiguous")
      ? "provisional"
      : "resolved",
    groups: DISCOVERY_TEMPLATE_GROUPS,
    documents,
    relationships: buildTemplateRelationships(catalogIdToDocId),
    missingDocuments: DISCOVERY_TEMPLATE_MISSING,
  };
}
