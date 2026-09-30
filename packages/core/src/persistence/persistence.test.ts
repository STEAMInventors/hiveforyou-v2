import { describe, expect, it, vi } from "vitest";

import {
  InMemoryCaseRepository,
  CaseIdConflictError,
  createOrReuseCase,
} from "./case-repository";
import { persistSourceDocument } from "./persist-source-document";
import { requireSessionUserId, withSessionOwner } from "./session-user";
import {
  InMemorySourceDocumentRepository,
  type SourceDocumentRecord,
} from "./source-document-repository";
import {
  InMemorySourceDocumentStorage,
  type SourceDocumentStorage,
} from "./source-document-storage";
import {
  buildSourceDocumentStoragePath,
  canAccessStorageObject,
} from "./storage-path";
import { assemblePersistedStudyRequest } from "./assemble-persisted-study-request";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const CASE_A = "33333333-3333-4333-8333-333333333333";

function sampleRecord(overrides: Partial<SourceDocumentRecord> = {}): SourceDocumentRecord {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    userId: USER_A,
    caseId: CASE_A,
    intakeRunId: null,
    studyRunId: null,
    clientStagedId: "staged-1",
    originalFilename: "iep.pdf",
    mimeType: "application/pdf",
    sizeBytes: 4,
    storageBucket: "case-documents",
    storagePath: `${USER_A}/${CASE_A}/44444444-4444-4444-8444-444444444444/iep.pdf`,
    sha256: "abc",
    status: "stored",
    createdAt: "2026-09-27T00:00:00.000Z",
    updatedAt: "2026-09-27T00:00:00.000Z",
    ...overrides,
  };
}

describe("session identity", () => {
  it("derives user id from the authenticated session and ignores a browser-supplied id", () => {
    const browserUserId = USER_B;
    const row = withSessionOwner(USER_A, {
      id: "case-1",
      user_id: browserUserId,
    });
    expect(requireSessionUserId(USER_A)).toBe(USER_A);
    expect(row.user_id).toBe(USER_A);
    expect(row.user_id).not.toBe(browserUserId);
  });

  it("fails closed when the session has no user", () => {
    expect(() => requireSessionUserId(null)).toThrow(/Authenticated session/);
    expect(() => requireSessionUserId("  ")).toThrow(/Authenticated session/);
  });
});

describe("private storage paths", () => {
  it("includes user, case, and document identity rather than using the filename as identity", () => {
    const path = buildSourceDocumentStoragePath({
      userId: USER_A,
      caseId: CASE_A,
      sourceDocumentId: "doc-1",
      originalFilename: "../secret/iep 2024.pdf",
    });
    expect(path).toBe(`${USER_A}/${CASE_A}/doc-1/iep_2024.pdf`);
    expect(path.split("/").filter((part) => part === "iep_2024.pdf")).toHaveLength(1);
    expect(canAccessStorageObject(USER_A, path)).toBe(true);
    expect(canAccessStorageObject(USER_B, path)).toBe(false);
  });
});

describe("persistSourceDocument", () => {
  it("persists metadata only after a successful upload", async () => {
    const order: string[] = [];
    const storage: SourceDocumentStorage = {
      async upload(input) {
        order.push("upload");
        return {
          bucket: input.bucket,
          path: buildSourceDocumentStoragePath(input),
        };
      },
      async get() {
        throw new Error("unused");
      },
      async remove() {
        order.push("remove");
      },
    };
    const documents = new InMemorySourceDocumentRepository();
    const insert = documents.insert.bind(documents);
    documents.insert = async (record) => {
      order.push("insert");
      await insert(record);
    };

    const saved = await persistSourceDocument(
      {
        storage,
        documents,
        bucket: "case-documents",
        createId: () => "doc-1",
      },
      {
        userId: USER_A,
        caseId: CASE_A,
        originalFilename: "iep.pdf",
        mimeType: "application/pdf",
        bytes: new Uint8Array([1, 2, 3, 4]),
        clientStagedId: "staged-1",
      },
    );

    expect(order).toEqual(["upload", "insert"]);
    expect(saved.status).toBe("stored");
    expect(saved.sha256).toHaveLength(64);
    expect(saved.storagePath.startsWith(`${USER_A}/${CASE_A}/doc-1/`)).toBe(true);
  });

  it("removes the orphaned object when metadata persistence fails", async () => {
    const storage = new InMemorySourceDocumentStorage();
    const documents = new InMemorySourceDocumentRepository();
    documents.insert = async () => {
      throw new Error("db down");
    };

    await expect(
      persistSourceDocument(
        {
          storage,
          documents,
          bucket: "case-documents",
          createId: () => "doc-9",
        },
        {
          userId: USER_A,
          caseId: CASE_A,
          originalFilename: "iep.pdf",
          bytes: new Uint8Array([9]),
        },
      ),
    ).rejects.toThrow(/db down/);

    expect(storage.uploaded).toHaveLength(1);
    expect(storage.removed).toEqual(storage.uploaded);
    expect(await documents.listByCase(USER_A, CASE_A)).toHaveLength(0);
  });

  it("does not insert metadata when the upload fails", async () => {
    const documents = new InMemorySourceDocumentRepository();
    const insert = vi.fn(documents.insert.bind(documents));
    documents.insert = insert;
    const storage: SourceDocumentStorage = {
      async upload() {
        throw new Error("storage down");
      },
      async get() {
        throw new Error("unused");
      },
      async remove() {
        throw new Error("unused");
      },
    };

    await expect(
      persistSourceDocument(
        { storage, documents, bucket: "case-documents" },
        {
          userId: USER_A,
          caseId: CASE_A,
          originalFilename: "iep.pdf",
          bytes: new Uint8Array([1]),
        },
      ),
    ).rejects.toThrow(/storage down/);
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("ownership", () => {
  it("does not return another user's document metadata", async () => {
    const documents = new InMemorySourceDocumentRepository();
    await documents.insert(sampleRecord());
    expect(await documents.getById(USER_B, sampleRecord().id)).toBeNull();
    expect(await documents.listByCase(USER_B, CASE_A)).toHaveLength(0);
    expect(await documents.getById(USER_A, sampleRecord().id)).not.toBeNull();
  });

  it("does not return another user's storage object", async () => {
    const storage = new InMemorySourceDocumentStorage(USER_B);
    const uploaded = await storage.upload({
      userId: USER_A,
      caseId: CASE_A,
      sourceDocumentId: "doc-1",
      originalFilename: "iep.pdf",
      bytes: new Uint8Array([1]),
      bucket: "case-documents",
    });
    await expect(storage.get(uploaded)).rejects.toThrow(/STORAGE_FORBIDDEN/);
    const ownerStorage = new InMemorySourceDocumentStorage(USER_A);
    const owned = await ownerStorage.upload({
      userId: USER_A,
      caseId: CASE_A,
      sourceDocumentId: "doc-1",
      originalFilename: "iep.pdf",
      bytes: new Uint8Array([1]),
      bucket: "case-documents",
    });
    await expect(ownerStorage.get(owned)).resolves.toEqual(new Uint8Array([1]));
  });

  it("does not reuse a case owned by someone else", async () => {
    const cases = new InMemoryCaseRepository();
    await cases.create({ id: CASE_A, userId: USER_A, domainId: null });
    const created = await createOrReuseCase(cases, {
      sessionUserId: USER_B,
      requestedCaseId: CASE_A,
      createId: () => "55555555-5555-4555-8555-555555555555",
    });
    expect(created.userId).toBe(USER_B);
    expect(created.id).not.toBe(CASE_A);
    expect(await cases.getById(USER_B, CASE_A)).toBeNull();
    await expect(
      cases.create({ id: CASE_A, userId: USER_B, domainId: null }),
    ).rejects.toBeInstanceOf(CaseIdConflictError);
  });
});

describe("assemblePersistedStudyRequest", () => {
  it("uses persisted document metadata and the stored answer snapshot", () => {
    const record = sampleRecord();
    const request = assemblePersistedStudyRequest({
      sessionUserId: USER_A,
      browserSuppliedUserId: USER_B,
      caseId: CASE_A,
      documents: [record, sampleRecord({ id: "other", userId: USER_B })],
      clientSourceDocuments: [
        {
          stagedDocumentId: record.id,
          discoveryDocumentId: `doc-${record.id}`,
          originalFilename: "browser-name.pdf",
          sizeBytes: 999,
        },
      ],
      engine1Result: {
        domainLabel: "Special education records",
        domainResolutionStatus: "resolved",
        groups: [],
        documents: [],
        relationships: [],
        missingDocuments: [],
      },
      questionSet: { id: "qs", questions: [] },
      answerSnapshot: {
        questionSetId: "qs",
        answers: {},
        missingNodeStates: {},
        ambiguityNodeStates: {},
        analysisIntent: { choiceIds: ["focus"] },
        userContext: null,
      },
      answerSnapshotId: "snap-1",
    });

    expect(request.actorUserId).toBe(USER_A);
    expect(request.sourceDocuments).toHaveLength(1);
    expect(request.sourceDocuments[0]?.originalFilename).toBe("iep.pdf");
    expect(request.sourceDocuments[0]?.sizeBytes).toBe(4);
    expect(request.sourceDocuments[0]?.storagePath).toContain(USER_A);
    expect(JSON.stringify(request)).not.toContain("%PDF");
    expect(request.answerSnapshotId).toBe("snap-1");
    expect("userId" in request).toBe(false);
  });
});
