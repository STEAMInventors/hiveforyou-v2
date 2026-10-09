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
