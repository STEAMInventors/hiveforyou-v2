import { createHash, randomUUID } from "node:crypto";

import type { SourceDocumentRepository, SourceDocumentRecord } from "./source-document-repository";
import type { SourceDocumentStorage } from "./source-document-storage";
import { requireSessionUserId } from "./session-user";
import { buildSourceDocumentStoragePath } from "./storage-path";

export type PersistSourceDocumentInput = {
  userId: string;
  caseId: string;
  originalFilename: string;
  mimeType?: string;
  bytes: Uint8Array;
  clientStagedId?: string | null;
  intakeRunId?: string | null;
};

export async function persistSourceDocument(
  deps: {
    storage: SourceDocumentStorage;
    documents: SourceDocumentRepository;
    bucket: string;
    now?: () => string;
    createId?: () => string;
  },
  input: PersistSourceDocumentInput,
): Promise<SourceDocumentRecord> {
  const userId = requireSessionUserId(input.userId);
  if (input.clientStagedId) {
    const existing = await deps.documents.findByClientStagedId(
      userId,
      input.caseId,
      input.clientStagedId,
    );
    if (existing) {
      return existing;
    }
  }

  const sourceDocumentId = deps.createId?.() ?? randomUUID();
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const storagePath = buildSourceDocumentStoragePath({
    userId,
    caseId: input.caseId,
    sourceDocumentId,
    originalFilename: input.originalFilename,
  });
  const uploaded = await deps.storage.upload({
    userId,
    caseId: input.caseId,
    sourceDocumentId,
    originalFilename: input.originalFilename,
    mimeType: input.mimeType,
    bytes: input.bytes,
    bucket: deps.bucket,
  });
  if (uploaded.path !== storagePath || uploaded.bucket !== deps.bucket) {
    await deps.storage.remove(uploaded);
    throw new Error("STORAGE_PATH_MISMATCH");
  }

  const now = deps.now?.() ?? new Date().toISOString();
  const record: SourceDocumentRecord = {
    id: sourceDocumentId,
    userId,
    caseId: input.caseId,
    intakeRunId: input.intakeRunId ?? null,
    studyRunId: null,
    clientStagedId: input.clientStagedId ?? null,
    originalFilename: input.originalFilename,
    mimeType: input.mimeType ?? null,
    sizeBytes: input.bytes.byteLength,
    storageBucket: uploaded.bucket,
    storagePath: uploaded.path,
    sha256,
    status: "stored",
    createdAt: now,
    updatedAt: now,
  };

  try {
    await deps.documents.insert(record);
  } catch (error) {
    await deps.storage.remove(uploaded);
    throw error;
  }
  return record;
}
