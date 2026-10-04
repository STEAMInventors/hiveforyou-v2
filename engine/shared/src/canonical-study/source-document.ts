export type StudySourceDocumentRef = {
  stagedDocumentId: string;
  discoveryDocumentId?: string;
  originalFilename: string;
  sizeBytes: number;
  mimeType?: string;
  /** Durable source-document identity. Filename is not identity. */
  sourceDocumentId?: string;
  sha256?: string;
  storageBucket?: string;
  storagePath?: string;
};
