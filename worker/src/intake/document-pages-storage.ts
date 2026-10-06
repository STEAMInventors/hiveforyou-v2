import type { DocumentPages } from "@hiveforyou/core/document/page-model";
import { extractNativeWords } from "@hiveforyou/intake/extract-native-words";
import { NESTIEP_EXTRACTOR_VERSION } from "@hiveforyou/shared/intake";
import { documentPagesStoragePath } from "@hiveforyou/shared/hive-artifact-paths";

import type { HiveGateway } from "../persistence/hive-gateway.js";

export const DOCUMENT_PAGES_PAYLOAD_SCHEMA_VERSION = 1;

export type DocumentPagesPayload = {
  schemaVersion: typeof DOCUMENT_PAGES_PAYLOAD_SCHEMA_VERSION;
  extractorVersion: string;
  documentPages: DocumentPages;
};

export function parseDocumentPagesPayload(bytes: Uint8Array): DocumentPagesPayload | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as DocumentPagesPayload;
    if (parsed.schemaVersion !== DOCUMENT_PAGES_PAYLOAD_SCHEMA_VERSION) {
      return null;
    }
    if (!parsed.documentPages?.documentId || !Array.isArray(parsed.documentPages.pages)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function encodeDocumentPagesPayload(payload: DocumentPagesPayload): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(payload));
}

export class DocumentPagesStorage {
  constructor(
    private readonly gateway: HiveGateway,
    private readonly bucket: string,
  ) {}

  async load(userId: string, sha256: string): Promise<DocumentPages | null> {
    const path = documentPagesStoragePath(userId, sha256);
    try {
      const bytes = await this.gateway.downloadObject(this.bucket, path);
      const payload = parseDocumentPagesPayload(bytes);
      return payload?.documentPages ?? null;
    } catch {
      return null;
    }
  }

  async saveIfAbsent(userId: string, sha256: string, documentPages: DocumentPages): Promise<void> {
    const path = documentPagesStoragePath(userId, sha256);
    try {
      await this.gateway.downloadObject(this.bucket, path);
      return;
    } catch {
      // cache miss — upload
    }
    const payload: DocumentPagesPayload = {
      schemaVersion: DOCUMENT_PAGES_PAYLOAD_SCHEMA_VERSION,
      extractorVersion: NESTIEP_EXTRACTOR_VERSION,
      documentPages,
    };
    await this.gateway.uploadObject(
      this.bucket,
      path,
      encodeDocumentPagesPayload(payload),
      "application/json",
    );
  }

  async rebuildFromPdfBytes(input: {
    userId: string;
    sha256: string;
    sourceDocumentId: string;
    bytes: Uint8Array;
  }): Promise<DocumentPages> {
    const documentPages = await extractNativeWords(input.bytes, {
      documentId: input.sourceDocumentId,
      sha256: input.sha256,
    });
    const path = documentPagesStoragePath(input.userId, input.sha256);
    const payload: DocumentPagesPayload = {
      schemaVersion: DOCUMENT_PAGES_PAYLOAD_SCHEMA_VERSION,
      extractorVersion: NESTIEP_EXTRACTOR_VERSION,
      documentPages,
    };
    await this.gateway.uploadObject(
      this.bucket,
      path,
      encodeDocumentPagesPayload(payload),
      "application/json",
    );
    return documentPages;
  }

  /**
   * Loads cached pages, or rebuilds from PDF bytes when missing or extractor version differs.
   */
  async loadOrRebuild(input: {
    userId: string;
    sha256: string;
    sourceDocumentId: string;
    bytes: Uint8Array;
  }): Promise<DocumentPages> {
    const path = documentPagesStoragePath(input.userId, input.sha256);
    try {
      const bytes = await this.gateway.downloadObject(this.bucket, path);
      const payload = parseDocumentPagesPayload(bytes);
      if (payload && payload.extractorVersion === NESTIEP_EXTRACTOR_VERSION) {
        return payload.documentPages;
      }
    } catch {
      // rebuild below
    }
    return this.rebuildFromPdfBytes(input);
  }

  async removeForSha256(userId: string, sha256: string): Promise<void> {
    const path = documentPagesStoragePath(userId, sha256);
    try {
      await this.gateway.removeObject(this.bucket, path);
    } catch {
      // best-effort
    }
  }
}
