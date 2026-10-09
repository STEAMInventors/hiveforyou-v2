import type { DocumentPages } from "@hiveforyou/core/document/page-model";
import { NESTIEP_EXTRACTOR_VERSION } from "@hiveforyou/shared/intake";

import { parseDocumentPagesPayload } from "../intake/document-pages-storage.js";

export type RegisteredQualificationDocument = {
  id: string;
  sha256: string;
};

export class TrustedDocumentPagesError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "TrustedDocumentPagesError";
  }
}

/**
 * Binds trusted page text to the registered source document id for this case.
 * Cache payloads may retain extraction-time ids (e.g. filenames); evidence and
 * the verifier use durable {@link sourceDocumentId} from persistence.
 */
export function bindDocumentPagesToSourceDocumentId(
  documentPages: DocumentPages,
  sourceDocumentId: string,
): DocumentPages {
  const authoritativeId = sourceDocumentId.trim();
  if (!authoritativeId) {
    throw new TrustedDocumentPagesError(
      "Registered source document id is required.",
      "SOURCE_DOCUMENT_ID_REQUIRED",
    );
  }
  if (
    documentPages.documentId === authoritativeId &&
    documentPages.pages.every((page) => page.documentId === authoritativeId)
  ) {
    return documentPages;
  }
  return {
    ...documentPages,
    documentId: authoritativeId,
    pages: documentPages.pages.map((page) => ({
      ...page,
      documentId: authoritativeId,
    })),
  };
}

export function assertTrustedDocumentPagesPayload(
  bytes: Uint8Array,
  expectedSha256: string,
): DocumentPages {
  const payload = parseDocumentPagesPayload(bytes);
  if (!payload) {
    throw new TrustedDocumentPagesError(
      "Document pages cache payload is invalid.",
      "DOCUMENT_PAGES_CACHE_INVALID",
    );
  }
  if (payload.extractorVersion !== NESTIEP_EXTRACTOR_VERSION) {
    throw new TrustedDocumentPagesError(
      "Document pages cache extractor version mismatch.",
      "DOCUMENT_PAGES_EXTRACTOR_MISMATCH",
    );
  }
  if (payload.documentPages.sha256.toLowerCase() !== expectedSha256.toLowerCase()) {
    throw new TrustedDocumentPagesError(
      "Document pages cache hash mismatch.",
      "DOCUMENT_PAGES_HASH_MISMATCH",
    );
  }
  return payload.documentPages;
}
