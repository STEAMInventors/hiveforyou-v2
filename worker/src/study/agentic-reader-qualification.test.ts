import { createHash } from "node:crypto";
import { TextEncoder } from "node:util";

import { describe, expect, it, vi } from "vitest";

import {
  L001_QUALIFICATION_SOURCE_SHA256,
  loadEffectiveStudyAgentsPromptMetadata,
} from "@hiveforyou/core/study";
import { documentPagesStoragePath } from "@hiveforyou/shared/hive-artifact-paths";
import { NESTIEP_EXTRACTOR_VERSION } from "@hiveforyou/shared/intake";

import { DOCUMENT_PAGES_PAYLOAD_SCHEMA_VERSION } from "../intake/document-pages-storage.js";
import type { HiveGateway, HiveRow } from "../persistence/hive-gateway.js";
import { buildStudyReaderRequestFromTrustedPages } from "./document-pages-to-reader-request.js";
import {
  AgenticReaderQualificationError,
  ensureAgenticReaderQualificationRun,
} from "./ensure-agentic-reader-qualification-run.js";
import { loadTrustedDocumentPageBundle } from "./load-trusted-document-pages.js";
import { runAgenticReaderQualification } from "./run-agentic-reader-qualification.js";

const READER_QUALIFICATION_MODEL_ENV: Record<string, string> = {
  MODEL_PROVIDER: "openai",
  MODEL_NAME: "gpt-5.6-sol",
  HIVE_AGENTS_CONFIG_MODEL_PROVIDER: "anthropic",
  HIVE_AGENTS_CONFIG_MODEL_NAME: "claude-opus-5-5",
  HIVE_AGENTS_DOCKER_COMPOSE_MODEL_PROVIDER: "anthropic",
  HIVE_AGENTS_DOCKER_COMPOSE_MODEL_NAME: "claude-opus-5-5",
  HIVE_AGENTS_MODEL_PROVIDER: "anthropic",
  HIVE_AGENTS_MODEL_NAME: "claude-opus-5-5",
};

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const CASE_A = "44444444-4444-4444-8444-444444444444";

function encodePagesPayload(documentId: string, sha256: string): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      schemaVersion: DOCUMENT_PAGES_PAYLOAD_SCHEMA_VERSION,
      extractorVersion: NESTIEP_EXTRACTOR_VERSION,
      documentPages: {
        documentId,
        sha256,
        pages: [
          {
            documentId,
            pageNumber: 1,
            width: 100,
            height: 100,
            rotation: 0,
            route: "native",
            imageRef: null,
            words: [
              {
                seq: 0,
                text: "Hello",
                bbox: [0, 0, 1, 1],
                confidence: 1,
                fontName: null,
                fontSize: null,
                bold: null,
                italic: null,
                source: "native",
              },
            ],
            quality: {
              textCoverage: 1,
              meanConfidence: 1,
              garbageRatio: 0,
              illegibleRegions: [],
            },
          },
        ],
        formFields: [],
      },
    }),
  );
}

function createStatefulGateway(seed?: {
  caseUserId?: string;
  sourceDocuments?: HiveRow[];
  objects?: Map<string, Uint8Array>;
}): { gateway: HiveGateway; studyRuns: HiveRow[]; traceEvents: HiveRow[] } {
  const studyRuns: HiveRow[] = [];
  const traceEvents: HiveRow[] = [];
  const objects = seed?.objects ?? new Map<string, Uint8Array>();

  const gateway: HiveGateway = {
    async insert(table, row) {
      if (table === "study_runs") {
        studyRuns.push({ ...row });
        return;
      }
      if (table === "agent_run_trace_events") {
        traceEvents.push({ ...row });
        return;
      }
      throw new Error(`unexpected insert ${table}`);
    },
    async upsert(table, row) {
      if (table !== "study_runs") {
        throw new Error(`unexpected upsert ${table}`);
      }
      const index = studyRuns.findIndex((existing) => existing.id === row.id);
      if (index >= 0) {
        studyRuns[index] = { ...studyRuns[index], ...row };
      } else {
        studyRuns.push({ ...row });
      }
    },
    async updateWhere() {
      throw new Error("unused");
    },
    async selectWhere(table, where) {
      if (table === "cases") {
        if (seed?.caseUserId !== String(where.user_id)) {
          return [];
        }
        return [{ id: where.id, user_id: where.user_id }];
      }
      if (table === "source_documents") {
        return (seed?.sourceDocuments ?? []).filter((row) =>
          Object.entries(where).every(([key, value]) => row[key] === value),
        );
      }
      if (table === "study_runs") {
        return studyRuns.filter((row) =>
          Object.entries(where).every(([key, value]) => row[key] === value),
        );
      }
      if (table === "agent_run_trace_events") {
        return traceEvents.filter((row) =>
          Object.entries(where).every(([key, value]) => row[key] === value),
        );
      }
      return [];
    },
    async downloadObject(_bucket, path) {
      const bytes = objects.get(path);
      if (!bytes) {
        throw new Error("object missing");
      }
      return bytes;
    },
    async uploadObject() {},
    async removeObject() {},
  };

  return { gateway, studyRuns, traceEvents };
}

function l001SourceDocuments(userId: string): HiveRow[] {
  return L001_QUALIFICATION_SOURCE_SHA256.map((sha256, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    case_id: CASE_A,
    user_id: userId,
    sha256,
    storage_bucket: "case-documents",
    storage_path: `${userId}/doc-${index + 1}.pdf`,
    mime_type: "application/pdf",
  }));
}

function l001CachedObjects(userId: string): Map<string, Uint8Array> {
  const objects = new Map<string, Uint8Array>();
  for (const [index, sha256] of L001_QUALIFICATION_SOURCE_SHA256.entries()) {
    objects.set(
      documentPagesStoragePath(userId, sha256),
      encodePagesPayload(`doc-${index}`, sha256),
    );
  }
  return objects;
}

describe("agentic reader qualification worker flow", () => {
  it("records anthropic Reader qualification metadata when worker defaults to openai", async () => {
    const { gateway } = createStatefulGateway({
      caseUserId: USER_A,
      sourceDocuments: l001SourceDocuments(USER_A),
      objects: l001CachedObjects(USER_A),
    });
    const result = await ensureAgenticReaderQualificationRun({
      env: READER_QUALIFICATION_MODEL_ENV,
      gateway,
      caseId: CASE_A,
      userId: USER_A,
    });
    expect(result.modelIdentity.modelProvider).toBe("anthropic");
    expect(result.modelIdentity.modelName).toBe("claude-opus-5-5");
    expect(result.run.providerMode).toBe("anthropic");
    expect(result.run.providerId).toBe("hive-agents-anthropic");
  });
  it("rejects case ownership failures", async () => {
    const { gateway } = createStatefulGateway({ caseUserId: USER_B });
    await expect(
      ensureAgenticReaderQualificationRun({
        env: READER_QUALIFICATION_MODEL_ENV,
        gateway,
        caseId: CASE_A,
        userId: USER_A,
      }),
    ).rejects.toMatchObject({ code: "CASE_OWNERSHIP_FAILED" });
  });

  it("rejects L001 scope mismatches", async () => {
    const { gateway } = createStatefulGateway({
      caseUserId: USER_A,
      sourceDocuments: [
        {
          id: "doc-1",
          case_id: CASE_A,
          user_id: USER_A,
          sha256: createHash("sha256").update("not-l001").digest("hex"),
        },
      ],
    });
    await expect(
      ensureAgenticReaderQualificationRun({
        env: READER_QUALIFICATION_MODEL_ENV,
        gateway,
        caseId: CASE_A,
        userId: USER_A,
      }),
    ).rejects.toMatchObject({ code: "L001_DOCUMENT_SCOPE_MISMATCH" });
  });

  it("fails closed when trusted document pages cache is missing", async () => {
    const { gateway } = createStatefulGateway();
    await expect(
      loadTrustedDocumentPageBundle({
        gateway,
        bucket: "document-pages",
        userId: USER_A,
        documents: [{ id: "doc-1", sha256: L001_QUALIFICATION_SOURCE_SHA256[0]! }],
      }),
    ).rejects.toMatchObject({ code: "DOCUMENT_PAGES_CACHE_MISSING" });
  });

  it("rejects mismatched document page hash in cache", async () => {
    const sha256 = L001_QUALIFICATION_SOURCE_SHA256[0]!;
    const wrongSha = createHash("sha256").update("wrong").digest("hex");
    const path = documentPagesStoragePath(USER_A, sha256);
    const objects = new Map<string, Uint8Array>([[path, encodePagesPayload("doc-1", wrongSha)]]);
    const { gateway } = createStatefulGateway({ objects });
    await expect(
      loadTrustedDocumentPageBundle({
        gateway,
        bucket: "document-pages",
        userId: USER_A,
        documents: [{ id: "doc-1", sha256 }],
      }),
    ).rejects.toMatchObject({ code: "DOCUMENT_PAGES_HASH_MISMATCH" });
  });

  it("maps trusted pages to reader request preserving source ids and word seq", () => {
    const request = buildStudyReaderRequestFromTrustedPages({
      caseId: CASE_A,
      userId: USER_A,
      domainId: "iep",
      studyRunId: "33333333-3333-4333-8333-333333333333",
      attemptId: "55555555-5555-4555-8555-555555555555",
      bundles: [
        {
          sourceDocumentId: "00000000-0000-4000-8000-000000000001",
          sha256: L001_QUALIFICATION_SOURCE_SHA256[0]!,
          documentPages: {
            documentId: "fixture-id",
            sha256: L001_QUALIFICATION_SOURCE_SHA256[0]!,
            pages: [
              {
                documentId: "fixture-id",
                pageNumber: 2,
                width: 1,
                height: 1,
                rotation: 0,
                route: "native",
                imageRef: null,
                words: [
                  {
                    seq: 3,
                    text: "Reading",
                    bbox: [0, 0, 1, 1],
                    confidence: 1,
                    fontName: null,
                    fontSize: null,
                    bold: null,
                    italic: null,
                    source: "native",
                  },
                ],
                quality: {
                  textCoverage: 1,
                  meanConfidence: 1,
                  garbageRatio: 0,
                  illegibleRegions: [],
                },
              },
            ],
            formFields: [],
          },
        },
      ],
    });
    expect(request.documents[0]?.sourceDocumentId).toBe("00000000-0000-4000-8000-000000000001");
    expect(request.documents[0]?.pages[0]?.pageNumber).toBe(2);
    expect(request.documents[0]?.pages[0]?.words[0]).toEqual({ seq: 3, text: "Reading" });
  });

  it("ensure is idempotent for the same qualification fingerprint", async () => {
    const { gateway } = createStatefulGateway({
      caseUserId: USER_A,
      sourceDocuments: l001SourceDocuments(USER_A),
    });
    const first = await ensureAgenticReaderQualificationRun({
      env: READER_QUALIFICATION_MODEL_ENV,
      gateway,
      caseId: CASE_A,
      userId: USER_A,
    });
    const second = await ensureAgenticReaderQualificationRun({
      env: READER_QUALIFICATION_MODEL_ENV,
      gateway,
      caseId: CASE_A,
      userId: USER_A,
    });
    expect(second.run.studyRunId).toBe(first.run.studyRunId);
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
  });

  it("run reports reader HTTP failures and clears RUNNING", async () => {
    const { gateway } = createStatefulGateway({
      caseUserId: USER_A,
      sourceDocuments: l001SourceDocuments(USER_A),
      objects: l001CachedObjects(USER_A),
    });
    await ensureAgenticReaderQualificationRun({ gateway, caseId: CASE_A, userId: USER_A, env: READER_QUALIFICATION_MODEL_ENV });
    const result = await runAgenticReaderQualification({
      env: READER_QUALIFICATION_MODEL_ENV,
      gateway,
      documentPagesBucket: "document-pages",
      caseId: CASE_A,
      userId: USER_A,
      readerClient: vi.fn(async () => {
        throw new Error("network down");
      }),
      now: () => "2026-10-09T12:00:00.000Z",
    });
    expect(result.outcome).toBe("failed");
    if (result.outcome !== "failed") {
      throw new Error("expected failed outcome");
    }
    expect(result.code).toBe("READER_HTTP_FAILED");
    expect(result.run.status).toBe("FAILED");
    expect(result.run.completedAt).toBe("2026-10-09T12:00:00.000Z");
  });

  it("run fails when audit is not persisted or zero accepted facts", async () => {
    const { gateway } = createStatefulGateway({
      caseUserId: USER_A,
      sourceDocuments: l001SourceDocuments(USER_A),
      objects: l001CachedObjects(USER_A),
    });
    await ensureAgenticReaderQualificationRun({ gateway, caseId: CASE_A, userId: USER_A, env: READER_QUALIFICATION_MODEL_ENV });

    const noAudit = await runAgenticReaderQualification({
      env: READER_QUALIFICATION_MODEL_ENV,
      gateway,
      documentPagesBucket: "document-pages",
      caseId: CASE_A,
      userId: USER_A,
      readerClient: async () => ({
        schemaVersion: "study-reader/1",
        candidateFacts: [],
        audit: { studyRunId: "x", attemptId: "y", persisted: false, status: "not_configured" },
      }),
    });
    expect(noAudit.outcome).toBe("failed");
    if (noAudit.outcome !== "failed") {
      throw new Error("expected failed outcome");
    }
    expect(noAudit.code).toBe("READER_AUDIT_NOT_PERSISTED");

    const zeroAccepted = await runAgenticReaderQualification({
      env: READER_QUALIFICATION_MODEL_ENV,
      gateway,
      documentPagesBucket: "document-pages",
      caseId: CASE_A,
      userId: USER_A,
      readerClient: async (request) => ({
        schemaVersion: "study-reader/1",
        candidateFacts: [{ id: "fact-1" }],
        audit: {
          studyRunId: request.studyRunId,
          attemptId: request.attemptId,
          persisted: true,
          status: "persisted",
        },
      }),
    });
    expect(zeroAccepted.outcome).toBe("failed");
    if (zeroAccepted.outcome !== "failed") {
      throw new Error("expected failed outcome");
    }
    expect(zeroAccepted.code).toBe("READER_ZERO_ACCEPTED_FACTS");
  });

  it("run succeeds with persisted audit and correlated trace acceptance", async () => {
    const { gateway, traceEvents } = createStatefulGateway({
      caseUserId: USER_A,
      sourceDocuments: l001SourceDocuments(USER_A),
      objects: l001CachedObjects(USER_A),
    });
    await ensureAgenticReaderQualificationRun({ gateway, caseId: CASE_A, userId: USER_A, env: READER_QUALIFICATION_MODEL_ENV });
    const prompt = loadEffectiveStudyAgentsPromptMetadata();

    const result = await runAgenticReaderQualification({
      env: READER_QUALIFICATION_MODEL_ENV,
      gateway,
      documentPagesBucket: "document-pages",
      caseId: CASE_A,
      userId: USER_A,
      readerClient: async (request) => {
        traceEvents.push(
          {
            study_run_id: request.studyRunId,
            attempt_id: request.attemptId,
            event_type: "STARTED",
            case_id: CASE_A,
            user_id: USER_A,
            sequence_number: 0,
          },
          {
            study_run_id: request.studyRunId,
            attempt_id: request.attemptId,
            event_type: "EVIDENCE_ACCEPTED",
            case_id: CASE_A,
            user_id: USER_A,
            sequence_number: 1,
          },
          {
            study_run_id: request.studyRunId,
            attempt_id: request.attemptId,
            event_type: "COMPLETED",
            case_id: CASE_A,
            user_id: USER_A,
            sequence_number: 2,
          },
        );
        return {
          schemaVersion: "study-reader/1",
          candidateFacts: [{ id: "fact-1" }],
          audit: {
            studyRunId: request.studyRunId,
            attemptId: request.attemptId,
            persisted: true,
            status: "persisted",
          },
        };
      },
    });

    expect(result.outcome).toBe("succeeded");
    expect(result.run.status).toBe("SUCCEEDED");
    expect(prompt.promptSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("does not silently repeat a succeeded qualification run", async () => {
    const { gateway, studyRuns } = createStatefulGateway({
      caseUserId: USER_A,
      sourceDocuments: l001SourceDocuments(USER_A),
      objects: l001CachedObjects(USER_A),
    });
    const ensured = await ensureAgenticReaderQualificationRun({
      env: READER_QUALIFICATION_MODEL_ENV,
      gateway,
      caseId: CASE_A,
      userId: USER_A,
    });
    const row = studyRuns.find((entry) => entry.id === ensured.run.studyRunId);
    expect(row).toBeDefined();
    if (row) {
      row.status = "SUCCEEDED";
    }

    const readerClient = vi.fn();
    const skipped = await runAgenticReaderQualification({
      env: READER_QUALIFICATION_MODEL_ENV,
      gateway,
      documentPagesBucket: "document-pages",
      caseId: CASE_A,
      userId: USER_A,
      readerClient,
    });
    expect(skipped.outcome).toBe("already_qualified");
    expect(readerClient).not.toHaveBeenCalled();
  });
});

describe("AgenticReaderQualificationError", () => {
  it("exposes stable error codes", () => {
    const error = new AgenticReaderQualificationError("msg", "CODE");
    expect(error.code).toBe("CODE");
  });
});
