import { buildSourceDocumentStoragePath, canAccessStorageObject } from "./storage-path";

export type StorageLocator = {
  bucket: string;
  path: string;
};

export type UploadSourceDocumentInput = {
  userId: string;
  caseId: string;
  sourceDocumentId: string;
  originalFilename: string;
  mimeType?: string;
  bytes: Uint8Array;
  bucket: string;
};

export interface SourceDocumentStorage {
  upload(input: UploadSourceDocumentInput): Promise<StorageLocator>;
  get(locator: StorageLocator): Promise<Uint8Array>;
  remove(locator: StorageLocator): Promise<void>;
}

function objectKey(locator: StorageLocator): string {
  return `${locator.bucket}:${locator.path}`;
}

/** Test and local adapter. Enforces the private path prefix when an actor is bound. */
export class InMemorySourceDocumentStorage implements SourceDocumentStorage {
  readonly uploaded: StorageLocator[] = [];
  readonly removed: StorageLocator[] = [];
  private readonly objects = new Map<string, Uint8Array>();

  constructor(private readonly actorUserId?: string) {}

  async upload(input: UploadSourceDocumentInput): Promise<StorageLocator> {
    const path = buildSourceDocumentStoragePath({
      userId: input.userId,
      caseId: input.caseId,
      sourceDocumentId: input.sourceDocumentId,
      originalFilename: input.originalFilename,
    });
    const locator = { bucket: input.bucket, path };
    this.objects.set(objectKey(locator), input.bytes);
    this.uploaded.push(locator);
    return locator;
  }

  async get(locator: StorageLocator): Promise<Uint8Array> {
    if (this.actorUserId && !canAccessStorageObject(this.actorUserId, locator.path)) {
      throw new Error("STORAGE_FORBIDDEN");
    }
    const bytes = this.objects.get(objectKey(locator));
    if (!bytes) {
      throw new Error("STORAGE_NOT_FOUND");
    }
    return bytes;
  }

  async remove(locator: StorageLocator): Promise<void> {
    this.removed.push(locator);
    this.objects.delete(objectKey(locator));
  }
}
