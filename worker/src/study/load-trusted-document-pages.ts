import type { DocumentPages } from "@hiveforyou/core/document/page-model";
import { documentPagesStoragePath } from "@hiveforyou/shared/hive-artifact-paths";

import {
  assertTrustedDocumentPagesPayload,
  type RegisteredQualificationDocument,
  TrustedDocumentPagesError,
} from "./trusted-document-pages-shared.js";
import type { HiveGateway } from "../persistence/hive-gateway.js";

export type { RegisteredQualificationDocument } from "./trusted-document-pages-shared.js";
export { TrustedDocumentPagesError, assertTrustedDocumentPagesPayload } from "./trusted-document-pages-shared.js";

export type TrustedDocumentPageBundle = {
  sourceDocumentId: string;
  sha256: string;
  documentPages: DocumentPages;
};

export async function loadTrustedDocumentPageBundle(input: {
  gateway: HiveGateway;
  bucket: string;
  userId: string;
  documents: RegisteredQualificationDocument[];
}): Promise<TrustedDocumentPageBundle[]> {
  const bundles: TrustedDocumentPageBundle[] = [];
  for (const document of input.documents) {
    const path = documentPagesStoragePath(input.userId, document.sha256);
    let bytes: Uint8Array;
    try {
      bytes = await input.gateway.downloadObject(input.bucket, path);
    } catch {
      throw new TrustedDocumentPagesError(
        `Document pages cache missing for source document ${document.id}.`,
        "DOCUMENT_PAGES_CACHE_MISSING",
      );
    }
    const documentPages = assertTrustedDocumentPagesPayload(bytes, document.sha256);
    bundles.push({
      sourceDocumentId: document.id,
      sha256: document.sha256,
      documentPages,
    });
  }
  return bundles;
}
