/** Client-side staged upload items — filenames and sizes only. */

export type StagedDocument = {
  id: string;
  file: File;
};

export function createStagedDocuments(files: File[]): StagedDocument[] {
  return files.map((file) => ({
    id: crypto.randomUUID(),
    file,
  }));
}

export function totalStagedBytes(documents: StagedDocument[]): number {
  return documents.reduce((sum, doc) => sum + doc.file.size, 0);
}

export function documentCountLabel(count: number): string {
  return `${count} document${count === 1 ? "" : "s"} selected`;
}
