import { describe, expect, it, vi } from "vitest";

import type { CaseIntelligenceSnapshot } from "@hiveforyou/canonical";
import { hashCanonicalJson } from "@hiveforyou/core";
import type { CanonicalStudyContext } from "@hiveforyou/shared/canonical-study";

import type { HiveGateway, HiveRow } from "./hive-gateway";
import {
  SupabaseCaseIntelligenceRepository,
  SupabaseSourceDocumentRepository,
  SupabaseSourceDocumentStorage,
  SupabaseStudyContextRepository,
} from "./supabase-repositories";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

function memoryGateway(): HiveGateway & { rows: HiveRow[]; updates: string[] } {
  const rows: HiveRow[] = [];
  const updates: string[] = [];
  const matches = (row: HiveRow, where: Record<string, string | number>) =>
    Object.entries(where).every(
      ([column, value]) => String(row[column]) === String(value),
    );

  return {
    rows,
    updates,
    async insert(_table, row) {
      rows.push({ ...row });
    },
    async upsert(_table, row) {
      const index = rows.findIndex((existing) => existing.id === row.id);
      if (index >= 0) {
        rows[index] = { ...rows[index], ...row };
        return;
      }
      rows.push({ ...row });
    },
    async updateWhere(table, row, where) {
      updates.push(table);
      for (const existing of rows) {
        if (matches(existing, where)) {
          Object.assign(existing, row);
        }
      }
    },
    async selectWhere(_table, where, options) {
      let selected = rows.filter((row) => matches(row, where));
      if (options?.orderBy) {
        const key = options.orderBy;
        selected = [...selected].sort((left, right) => {
          const delta = Number(left[key]) - Number(right[key]);
          return options.ascending === false ? -delta : delta;
        });
      }
      if (options?.limit) {
        selected = selected.slice(0, options.limit);
      }
      return selected.map((row) => ({ ...row }));
    },
    async uploadObject() {
      throw new Error("unused");
    },
    async downloadObject() {
      throw new Error("download should not run");
    },
    async removeObject() {
      return undefined;
    },
  };
}

describe("supabase persistence adapters", () => {
  it("stores document metadata for the session user and hides it from another user", async () => {
    const gateway = memoryGateway();
    const documents = new SupabaseSourceDocumentRepository(gateway, USER_A);
    await documents.insert({
      id: "doc-1",
      userId: USER_B,
      caseId: "case-1",
      intakeRunId: null,
      studyRunId: null,
      clientStagedId: "staged-1",
      originalFilename: "iep.pdf",
      mimeType: "application/pdf",
      sizeBytes: 3,
      storageBucket: "case-documents",
      storagePath: `${USER_A}/case-1/doc-1/iep.pdf`,
      sha256: "abc",
      status: "stored",
      createdAt: "2026-09-27T00:00:00.000Z",
      updatedAt: "2026-09-27T00:00:00.000Z",
    });
    expect(gateway.rows[0]?.user_id).toBe(USER_A);
    expect(await documents.getById(USER_A, "doc-1")).not.toBeNull();
    const otherUser = new SupabaseSourceDocumentRepository(gateway, USER_B);
    expect(await otherUser.getById(USER_B, "doc-1")).toBeNull();
    expect(await otherUser.listByCase(USER_B, "case-1")).toEqual([]);
  });

  it("refuses to read another user's storage object", async () => {
    const gateway = memoryGateway();
    const download = vi.fn(gateway.downloadObject.bind(gateway));
    gateway.downloadObject = download;
    const storage = new SupabaseSourceDocumentStorage(gateway, "case-documents", USER_B);
    await expect(
      storage.get({
        bucket: "case-documents",
        path: `${USER_A}/case-1/doc-1/iep.pdf`,
      }),
    ).rejects.toThrow(/STORAGE_FORBIDDEN/);
    expect(download).not.toHaveBeenCalled();
  });

  it("rejects a mutated study context and keeps the original hash", async () => {
    const gateway = memoryGateway();
    const contexts = new SupabaseStudyContextRepository(gateway, USER_A);
    const context = {
      schemaVersion: "canonical-study-context/1",
      caseId: "case-1",
      studyRunId: "run-1",
      idempotencyKey: "key",
      createdAt: "2026-09-27T00:00:00.000Z",
      domainLabel: "Special education records",
      domainId: "iep",
      domainPackId: "hive.domain.iep",
      domainPackVersion: "0.0.0-scaffold",
      domainPackVocabulary: {
        entityTypes: [],
        claimTypes: [],
        relationshipTypes: [],
        eventTypes: [],
      },
      sourceDocuments: [],
      engine1Result: {
        domainLabel: "Special education records",
        domainResolutionStatus: "resolved",
        groups: [],
        documents: [],
        relationships: [],
        missingDocuments: [],
      },
      questionSetVersion: "qs",
      questionSet: { id: "qs", questions: [] },
      answerSnapshot: {
        questionSetId: "qs",
        answers: {},
        missingNodeStates: {},
        ambiguityNodeStates: {},
        analysisIntent: null,
        userContext: null,
      },
      processingPolicy: {
        intentAffectsFacts: false as const,
        providerId: "fixture",
        providerMode: "fixture" as const,
        promptId: "canonical-study",
        promptVersion: "v1",
        promptSha256: "abc",
      },
    } satisfies CanonicalStudyContext;
    await contexts.save(context);
    await contexts.save(context);
    await expect(
      contexts.save({ ...context, domainLabel: "changed" }),
    ).rejects.toThrow(/STUDY_CONTEXT_IMMUTABLE/);
    expect(gateway.rows).toHaveLength(1);
    expect(gateway.rows[0]?.context_hash).toBe(hashCanonicalJson(context));
    expect(gateway.updates).toEqual([]);
  });

  it("inserts a new case intelligence version instead of updating the old one", async () => {
    const gateway = memoryGateway();
    const intelligence = new SupabaseCaseIntelligenceRepository(gateway, USER_A);
    const snapshot = {
      schemaVersion: "case-intelligence/1",
      version: 1,
      caseId: "case-1",
      studyRunId: "run-1",
      createdAt: "2026-09-27T00:00:00.000Z",
      domainId: "iep",
      domainPackId: "hive.domain.iep",
      domainPackVersion: "0.0.0-scaffold",
      sourceDocuments: [],
      entities: [],
      claims: [],
      claimEvidence: [],
      relationships: [],
      events: [],
      conflicts: [],
      missingness: [],
      derivedClaims: [],
      analysisIntent: null,
      userContext: null,
      validationResult: {
        status: "SUCCEEDED",
        accepted: {
          entities: [],
          claims: [],
          relationships: [],
          events: [],
          conflicts: [],
          missingness: [],
          derivedClaimCandidates: [],
        },
        rejected: [],
        warnings: [],
      },
    } as unknown as CaseIntelligenceSnapshot;
    await intelligence.save(snapshot);
    await intelligence.save({ ...snapshot, version: 2, studyRunId: "run-2" });
    expect(await intelligence.getLatestVersion("case-1")).toBe(2);
    expect((await intelligence.getByVersion("case-1", 1))?.studyRunId).toBe("run-1");
    await expect(intelligence.save(snapshot)).rejects.toThrow(
      /CASE_INTELLIGENCE_VERSION_EXISTS/,
    );
    expect(gateway.updates).toEqual([]);
    expect(gateway.rows.every((row) => row.user_id === USER_A)).toBe(true);
  });
});
