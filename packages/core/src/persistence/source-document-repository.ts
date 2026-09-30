export type SourceDocumentRecord = {
  id: string;
  userId: string;
  caseId: string;
  intakeRunId: string | null;
  studyRunId: string | null;
  clientStagedId: string | null;
  originalFilename: string;
  mimeType: string | null;
  sizeBytes: number;
  storageBucket: string;
  storagePath: string;
  sha256: string;
  status: "stored";
  createdAt: string;
  updatedAt: string;
};

export interface SourceDocumentRepository {
  insert(record: SourceDocumentRecord): Promise<void>;
  getById(userId: string, id: string): Promise<SourceDocumentRecord | null>;
  findByClientStagedId(
    userId: string,
    caseId: string,
    clientStagedId: string,
  ): Promise<SourceDocumentRecord | null>;
  listByCase(userId: string, caseId: string): Promise<SourceDocumentRecord[]>;
  attachStudyRun(userId: string, caseId: string, studyRunId: string): Promise<void>;
}

export class InMemorySourceDocumentRepository implements SourceDocumentRepository {
  private readonly rows: SourceDocumentRecord[] = [];

  async insert(record: SourceDocumentRecord): Promise<void> {
    this.rows.push(structuredClone(record));
  }

  async getById(userId: string, id: string): Promise<SourceDocumentRecord | null> {
    return (
      this.rows.find((row) => row.id === id && row.userId === userId) ?? null
    );
  }

  async findByClientStagedId(
    userId: string,
    caseId: string,
    clientStagedId: string,
  ): Promise<SourceDocumentRecord | null> {
    return (
      this.rows.find(
        (row) =>
          row.userId === userId &&
          row.caseId === caseId &&
          row.clientStagedId === clientStagedId,
      ) ?? null
    );
  }

  async listByCase(userId: string, caseId: string): Promise<SourceDocumentRecord[]> {
    return this.rows.filter((row) => row.userId === userId && row.caseId === caseId);
  }

  async attachStudyRun(
    userId: string,
    caseId: string,
    studyRunId: string,
  ): Promise<void> {
    for (const row of this.rows) {
      if (row.userId === userId && row.caseId === caseId) {
        row.studyRunId = studyRunId;
        row.updatedAt = new Date().toISOString();
      }
    }
  }
}
