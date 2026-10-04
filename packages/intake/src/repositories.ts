import type {
  DocumentExtractionRecord,
  DocumentIdentityRecord,
  DocumentNormalizedExtractionRecord,
  IntakeRunRecord,
} from "./types";

export interface IntakeRunRepository {
  insert(run: IntakeRunRecord): Promise<void>;
  getById(userId: string, id: string): Promise<IntakeRunRecord | null>;
  getByIdempotencyKey(
    userId: string,
    caseId: string,
    idempotencyKey: string,
  ): Promise<IntakeRunRecord | null>;
  save(run: IntakeRunRecord): Promise<void>;
}

export interface DocumentIdentityRepository {
  insert(record: DocumentIdentityRecord): Promise<void>;
  listByRun(userId: string, intakeRunId: string): Promise<DocumentIdentityRecord[]>;
  save(record: DocumentIdentityRecord): Promise<void>;
}

export interface DocumentExtractionRepository {
  upsertPages(pages: DocumentExtractionRecord[]): Promise<void>;
  listBySourceHash(
    userId: string,
    sourceDocumentId: string,
    sourceHash: string,
    extractionMethod: string,
  ): Promise<DocumentExtractionRecord[]>;
}

export interface DocumentNormalizedExtractionRepository {
  upsert(record: DocumentNormalizedExtractionRecord): Promise<void>;
  getBySourceHash(
    userId: string,
    sourceDocumentId: string,
    sourceHash: string,
  ): Promise<DocumentNormalizedExtractionRecord | null>;
}

export function isIntakeConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /duplicate|unique|23505|INTAKE_CONFLICT/i.test(message);
}
