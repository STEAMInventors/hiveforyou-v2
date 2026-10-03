import type {
  DocumentExtractionRepository,
  DocumentIdentityRepository,
  IntakeRunRepository,
} from "./repositories";
import type {
  DocumentExtractionRecord,
  DocumentIdentityRecord,
  DocumentNormalizedExtractionRecord,
  IntakeRunRecord,
} from "./types";
import type { DocumentNormalizedExtractionRepository } from "./repositories";

export class InMemoryIntakeRunRepository implements IntakeRunRepository {
  readonly rows: IntakeRunRecord[] = [];

  async insert(run: IntakeRunRecord): Promise<void> {
    if (
      this.rows.some(
        (row) => row.caseId === run.caseId && row.idempotencyKey === run.idempotencyKey,
      )
    ) {
      throw new Error("INTAKE_CONFLICT");
    }
    this.rows.push(structuredClone(run));
  }

  async getById(userId: string, id: string): Promise<IntakeRunRecord | null> {
    return this.rows.find((row) => row.userId === userId && row.id === id) ?? null;
  }

  async getByIdempotencyKey(
    userId: string,
    caseId: string,
    idempotencyKey: string,
  ): Promise<IntakeRunRecord | null> {
    return (
      this.rows.find(
        (row) =>
          row.userId === userId &&
          row.caseId === caseId &&
          row.idempotencyKey === idempotencyKey,
      ) ?? null
    );
  }

  async save(run: IntakeRunRecord): Promise<void> {
    const index = this.rows.findIndex((row) => row.id === run.id && row.userId === run.userId);
    if (index < 0) {
      throw new Error("INTAKE_RUN_NOT_FOUND");
    }
    this.rows[index] = structuredClone(run);
  }
}

export class InMemoryDocumentIdentityRepository implements DocumentIdentityRepository {
  readonly rows: DocumentIdentityRecord[] = [];

  async insert(record: DocumentIdentityRecord): Promise<void> {
    if (
      this.rows.some(
        (row) =>
          row.intakeRunId === record.intakeRunId &&
          row.sourceDocumentId === record.sourceDocumentId,
      )
    ) {
      throw new Error("INTAKE_CONFLICT");
    }
    this.rows.push(structuredClone(record));
  }

  async listByRun(userId: string, intakeRunId: string): Promise<DocumentIdentityRecord[]> {
    return this.rows
      .filter((row) => row.userId === userId && row.intakeRunId === intakeRunId)
      .map((row) => structuredClone(row))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async save(record: DocumentIdentityRecord): Promise<void> {
    const index = this.rows.findIndex(
      (row) => row.id === record.id && row.userId === record.userId,
    );
    if (index < 0) {
      throw new Error("DOCUMENT_IDENTITY_NOT_FOUND");
    }
    this.rows[index] = structuredClone(record);
  }
}

export class InMemoryDocumentNormalizedExtractionRepository
  implements DocumentNormalizedExtractionRepository
{
  readonly rows: DocumentNormalizedExtractionRecord[] = [];

  async upsert(record: DocumentNormalizedExtractionRecord): Promise<void> {
    const index = this.rows.findIndex(
      (row) =>
        row.sourceDocumentId === record.sourceDocumentId && row.sourceHash === record.sourceHash,
    );
    if (index >= 0) {
      this.rows[index] = structuredClone(record);
    } else {
      this.rows.push(structuredClone(record));
    }
  }

  async getBySourceHash(
    userId: string,
    sourceDocumentId: string,
    sourceHash: string,
  ): Promise<DocumentNormalizedExtractionRecord | null> {
    return (
      this.rows.find(
        (row) =>
          row.userId === userId &&
          row.sourceDocumentId === sourceDocumentId &&
          row.sourceHash === sourceHash,
      ) ?? null
    );
  }
}

export class InMemoryDocumentExtractionRepository implements DocumentExtractionRepository {
  readonly rows: DocumentExtractionRecord[] = [];

  async upsertPages(pages: DocumentExtractionRecord[]): Promise<void> {
    for (const page of pages) {
      const index = this.rows.findIndex(
        (row) =>
          row.sourceDocumentId === page.sourceDocumentId &&
          row.pageNumber === page.pageNumber &&
          row.extractionMethod === page.extractionMethod &&
          row.sourceHash === page.sourceHash,
      );
      if (index >= 0) {
        this.rows[index] = structuredClone(page);
      } else {
        this.rows.push(structuredClone(page));
      }
    }
  }

  async listBySourceHash(
    userId: string,
    sourceDocumentId: string,
    sourceHash: string,
    extractionMethod: string,
  ): Promise<DocumentExtractionRecord[]> {
    return this.rows
      .filter(
        (row) =>
          row.userId === userId &&
          row.sourceDocumentId === sourceDocumentId &&
          row.sourceHash === sourceHash &&
          row.extractionMethod === extractionMethod,
      )
      .map((row) => structuredClone(row))
      .sort((left, right) => left.pageNumber - right.pageNumber);
  }
}
