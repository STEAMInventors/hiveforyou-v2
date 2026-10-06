import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { extractNativeWords } from "@hiveforyou/intake/extract-native-words";

import type { DocumentPages } from "../../src/document/page-model.ts";

import { stableJson } from "./prompt-hash.ts";

export type DocumentPagesSnapshot = {
  sourcePdfFileName: string;
  sourcePdfSha256: string;
  documentPages: DocumentPages;
};

export function documentPagesSnapshotPath(corpusDir: string, pdfFilename: string): string {
  const snapshotDir = join(corpusDir, "document-pages");
  return join(snapshotDir, pdfFilename.replace(/\.pdf$/i, ".json"));
}

export function readDocumentPagesSnapshot(path: string): DocumentPages {
  const snapshot = JSON.parse(readFileSync(path, "utf8")) as DocumentPagesSnapshot;
  return snapshot.documentPages;
}

/** Same path as worker `DocumentPagesStorage.rebuildFromPdfBytes` (extractNativeWords). */
export async function buildDocumentPagesFromPdf(input: {
  corpusDir: string;
  pdfFilename: string;
  sha256: string;
}): Promise<DocumentPagesSnapshot> {
  const bytes = readFileSync(join(input.corpusDir, input.pdfFilename));
  const computed = createHash("sha256").update(bytes).digest("hex");
  if (computed !== input.sha256) {
    throw new Error(`SHA256_MISMATCH:${input.pdfFilename}`);
  }
  const documentPages = await extractNativeWords(bytes, {
    documentId: input.pdfFilename,
    sha256: input.sha256,
  });
  return {
    sourcePdfFileName: input.pdfFilename,
    sourcePdfSha256: input.sha256,
    documentPages,
  };
}

export async function ensureDocumentPagesSnapshot(input: {
  corpusDir: string;
  pdfFilename: string;
  sha256: string;
}): Promise<{ pages: DocumentPages; created: boolean }> {
  const snapshotPath = documentPagesSnapshotPath(input.corpusDir, input.pdfFilename);
  if (existsSync(snapshotPath)) {
    return { pages: readDocumentPagesSnapshot(snapshotPath), created: false };
  }
  const snapshotDir = join(input.corpusDir, "document-pages");
  mkdirSync(snapshotDir, { recursive: true });
  const snapshot = await buildDocumentPagesFromPdf(input);
  writeFileSync(snapshotPath, `${stableJson(snapshot)}\n`, "utf8");
  return { pages: snapshot.documentPages, created: true };
}
