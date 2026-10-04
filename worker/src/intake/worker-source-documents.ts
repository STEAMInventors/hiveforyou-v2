import type { HiveGateway } from "../persistence/hive-gateway.js";

function canAccessStorageObject(actorUserId: string, storagePath: string): boolean {
  return storagePath.startsWith(`${actorUserId}/`);
}
import type { IntakeSourceDocument } from "@hiveforyou/intake";

export type WorkerSourceDocumentRecord = {
  id: string;
  caseId: string;
  mimeType: string | null;
  sha256: string;
  storageBucket: string;
  storagePath: string;
  originalFilename?: string;
  sizeBytes?: number;
};

export class WorkerSourceDocumentRepository {
  constructor(
    private readonly gateway: HiveGateway,
    private readonly userId: string,
  ) {}

  async listByCase(userId: string, caseId: string): Promise<WorkerSourceDocumentRecord[]> {
    if (userId !== this.userId) {
      return [];
    }
    const rows = await this.gateway.selectWhere("source_documents", {
      case_id: caseId,
      user_id: this.userId,
    });
    return rows.map((row) => ({
      id: String(row.id),
      caseId: String(row.case_id),
      mimeType: row.mime_type == null ? null : String(row.mime_type),
      sha256: String(row.sha256),
      storageBucket: String(row.storage_bucket),
      storagePath: String(row.storage_path),
      originalFilename: row.original_filename == null ? "Document" : String(row.original_filename),
      sizeBytes: row.size_bytes == null ? 0 : Number(row.size_bytes),
    }));
  }

  async getById(userId: string, id: string): Promise<WorkerSourceDocumentRecord | null> {
    if (userId !== this.userId) {
      return null;
    }
    const rows = await this.gateway.selectWhere(
      "source_documents",
      { id, user_id: this.userId },
      { limit: 1 },
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      id: String(row.id),
      caseId: String(row.case_id),
      mimeType: row.mime_type == null ? null : String(row.mime_type),
      sha256: String(row.sha256),
      storageBucket: String(row.storage_bucket),
      storagePath: String(row.storage_path),
    };
  }

  async loadBytes(record: WorkerSourceDocumentRecord): Promise<Uint8Array> {
    if (!canAccessStorageObject(this.userId, record.storagePath)) {
      throw new Error("STORAGE_FORBIDDEN");
    }
    return this.gateway.downloadObject(record.storageBucket, record.storagePath);
  }

  async loadIntakeSource(
    userId: string,
    caseId: string,
    sourceDocumentId: string,
  ): Promise<IntakeSourceDocument | null> {
    const record = await this.getById(userId, sourceDocumentId);
    if (!record || record.caseId !== caseId) {
      return null;
    }
    const bytes = await this.loadBytes(record);
    return {
      sourceDocumentId: record.id,
      mimeType: record.mimeType,
      sha256: record.sha256,
      bytes,
    };
  }
}
