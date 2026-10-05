import { describe, expect, it } from "vitest";

import type { SourceDocumentRecord } from "@hiveforyou/core";
import type { SourceDocumentRepository } from "@hiveforyou/core";
import type { CanonicalCaseSnapshot } from "@hiveforyou/shared/case-intelligence/3";

import {
  matchStudySourceDocumentRef,
  resolvePersistedSourceDocumentForStudy,
} from "./resolve-study-source-document.server";

const USER = "user-1";
const CASE = "case-1";

function doc(partial: Partial<SourceDocumentRecord> & { id: string }): SourceDocumentRecord {
  return {
    userId: USER,
    caseId: CASE,
    intakeRunId: null,
    studyRunId: null,
    clientStagedId: null,
    originalFilename: "iep.pdf",
    mimeType: "application/pdf",
    sizeBytes: 100,
    storageBucket: "case-documents",
    storagePath: `${USER}/${CASE}/${partial.id}/iep.pdf`,
    sha256: "abc",
    status: "stored",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

class MemoryDocs implements SourceDocumentRepository {
  constructor(private readonly rows: SourceDocumentRecord[]) {}

  async create(): Promise<SourceDocumentRecord> {
    throw new Error("not implemented");
  }

  async getById(_userId: string, id: string) {
    return this.rows.find((row) => row.id === id) ?? null;
  }

  async findByClientStagedId(_userId: string, _caseId: string, clientStagedId: string) {
    return this.rows.find((row) => row.clientStagedId === clientStagedId) ?? null;
  }

  async listByCase(_userId: string, caseId: string) {
    return this.rows.filter((row) => row.caseId === caseId);
  }

  async insert(_record: SourceDocumentRecord): Promise<void> {
    throw new Error("not implemented");
  }

  async attachStudyRun(): Promise<void> {
    return;
  }
}

const snapshot = {
  sourceDocuments: [
    {
      stagedDocumentId: "staged-iep",
      discoveryDocumentId: "disc-iep",
      sourceDocumentId: "persisted-iep",
      originalFilename: "01_prior_iep.pdf",
      sizeBytes: 1,
      sha256: "hash-iep",
    },
  ],
} as CanonicalCaseSnapshot;

describe("resolvePersistedSourceDocumentForStudy", () => {
  it("resolves discovery id to persisted source row", async () => {
    const rows = [doc({ id: "persisted-iep", clientStagedId: "staged-iep", sha256: "hash-iep" })];
    const resolved = await resolvePersistedSourceDocumentForStudy({
      documents: new MemoryDocs(rows),
      userId: USER,
      caseId: CASE,
      requestedSourceDocumentId: "disc-iep",
      snapshot,
      structureMap: null,
    });
    expect(resolved?.id).toBe("persisted-iep");
  });

  it("matches snapshot refs by staged id", () => {
    const meta = matchStudySourceDocumentRef(snapshot, "staged-iep");
    expect(meta?.sourceDocumentId).toBe("persisted-iep");
  });
});
