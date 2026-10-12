import type {
  SourceDocumentRepository,
  SourceDocumentRecord,
  SourceDocumentStorage,
  StorageLocator,
  UploadSourceDocumentInput,
} from "@hiveforyou/core";

import type { WorkerSourceDocumentRepository } from "../intake/worker-source-documents.js";

function toRecord(userId: string, row: NonNullable<Awaited<ReturnType<WorkerSourceDocumentRepository["getById"]>>>): SourceDocumentRecord {
  return {
    id: row.id,
    userId,
    caseId: row.caseId,
    intakeRunId: null,
    studyRunId: null,
    clientStagedId: null,
    originalFilename: row.originalFilename ?? "Document",
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes ?? 0,
    storageBucket: row.storageBucket,
    storagePath: row.storagePath,
    sha256: row.sha256,
    status: "stored",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

export function workerDiscoverDocumentRepository(
  repo: WorkerSourceDocumentRepository,
): SourceDocumentRepository {
  return {
    async insert(): Promise<void> {
      throw new Error("DISCOVER_DOCUMENTS_READ_ONLY");
    },
    async findByClientStagedId(): Promise<SourceDocumentRecord | null> {
      return null;
    },
    async attachStudyRun(): Promise<void> {},
    async getById(uid: string, id: string): Promise<SourceDocumentRecord | null> {
      const row = await repo.getById(uid, id);
      return row ? toRecord(uid, row) : null;
    },
    async listByCase(uid: string, caseId: string): Promise<SourceDocumentRecord[]> {
      const rows = await repo.listByCase(uid, caseId);
      return rows.map((row) => toRecord(uid, row));
    },
  };
}

export function workerDiscoverDocumentStorage(
  repo: WorkerSourceDocumentRepository,
  userId: string,
  caseId: string,
): SourceDocumentStorage {
  return {
    async upload(_input: UploadSourceDocumentInput): Promise<StorageLocator> {
      throw new Error("DISCOVER_STORAGE_READ_ONLY");
    },
    async remove(): Promise<void> {
      throw new Error("DISCOVER_STORAGE_READ_ONLY");
    },
    async get(locator: StorageLocator): Promise<Uint8Array> {
      const rows = await repo.listByCase(userId, caseId);
      const match = rows.find(
        (row) => row.storageBucket === locator.bucket && row.storagePath === locator.path,
      );
      if (!match) {
        throw new Error("DISCOVER_STORAGE_NOT_FOUND");
      }
      return repo.loadBytes(match);
    },
  };
}
