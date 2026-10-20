import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TextEncoder } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AGENTIC_READER_QUALIFICATION_ANSWER_SNAPSHOT_HASH,
  AGENTIC_READER_QUALIFICATION_QUESTION_SET_VERSION,
  buildAgenticReaderQualificationEngineFingerprint,
  computeAgenticReaderQualificationIdempotencyKey,
  fingerprintRegisteredSourceDocuments,
  L001_QUALIFICATION_SOURCE_SHA256,
  loadEffectiveStudyAgentsPromptMetadata,
  loadReaderExperimentPromptHashes,
  IEP_CANDIDATE_READER_PACK_CONTENT_SHA256,
  L001_READER_PACK_CONTENT_SHA256,
  ReaderProposalPackBindingError,
  resolveAgenticReaderModelIdentity,
} from "@hiveforyou/core/study";
import { documentPagesStoragePath, readerAcceptedFactsStoragePath } from "@hiveforyou/shared/hive-artifact-paths";
import { READER_ACCEPTED_FACTS_SCHEMA_VERSION } from "@hiveforyou/shared/reader-accepted-facts";
import { NESTIEP_EXTRACTOR_VERSION } from "@hiveforyou/shared/intake";

import { DOCUMENT_PAGES_PAYLOAD_SCHEMA_VERSION } from "../intake/document-pages-storage.js";
import { readWorkerEnv } from "../env.js";
import type { HiveGateway, HiveRow } from "../persistence/hive-gateway.js";
import { buildStudyReaderRequestFromTrustedPages } from "./document-pages-to-reader-request.js";
import {
  AgenticReaderQualificationError,
  ensureAgenticReaderQualificationRun,
} from "./ensure-agentic-reader-qualification-run.js";
import { loadTrustedDocumentPageBundle } from "./load-trusted-document-pages.js";
import { ReaderHttpInvocationError } from "./reader-qualification-pipeline-error.js";
import { runAgenticReaderQualification } from "./run-agentic-reader-qualification.js";
import {
  PackDrivenReaderAuditNotPersistedError,
  PackDrivenReaderProductionError,
  runProductionPackDrivenReader,
} from "./run-production-pack-driven-reader.js";
import type { CanonicalStudyContext } from "@hiveforyou/shared/canonical-study";
import { READER_DOCUMENT_EXTRACTION_SCHEMA_VERSION } from "@hiveforyou/shared/reader-document-extraction";
import * as engine1 from "./engine1-reader-context.js";
import * as loadPages from "./load-trusted-document-pages.js";
import * as coreStudy from "@hiveforyou/core/study";

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
}): {
  gateway: HiveGateway;
  studyRuns: HiveRow[];
  traceEvents: HiveRow[];
  uploadedObjects: Map<string, Uint8Array>;
} {
  const studyRuns: HiveRow[] = [];
  const traceEvents: HiveRow[] = [];
  const objects = seed?.objects ?? new Map<string, Uint8Array>();
  const uploadedObjects = new Map<string, Uint8Array>();

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
    async uploadObject(_bucket, path, bytes) {
      uploadedObjects.set(path, bytes);
      objects.set(path, bytes);
    },
    async removeObject() {},
  };

  return { gateway, studyRuns, traceEvents, uploadedObjects };
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
      proposalPack: {
        packId: "iep",
        packVersion: "0.3.0-proposed",
        packContentSha256: "c".repeat(64),
      },
      studyRunId: "33333333-3333-4333-8333-333333333333",
      attemptId: "55555555-5555-4555-8555-555555555555",
      readerMode: "pack_driven",
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
    expect(request.readerMode).toBe("pack_driven");
    expect(request.documents[0]?.sourceDocumentId).toBe("00000000-0000-4000-8000-000000000001");
    expect(request.documents[0]?.pages[0]?.pageNumber).toBe(2);
    expect(request.documents[0]?.pages[0]?.words[0]).toEqual({ seq: 3, text: "Reading" });
  });

  it("ensure does not reuse a legacy shared-prefix case_wide SUCCEEDED run after A2 pins", async () => {
    const { gateway, studyRuns } = createStatefulGateway({
      caseUserId: USER_A,
      sourceDocuments: l001SourceDocuments(USER_A),
    });
    const prompt = loadEffectiveStudyAgentsPromptMetadata();
    const hashes = loadReaderExperimentPromptHashes();
    const model = resolveAgenticReaderModelIdentity(READER_QUALIFICATION_MODEL_ENV);
    const legacyEngine = buildAgenticReaderQualificationEngineFingerprint({
      promptSha256: hashes.sharedPromptSha256,
      modelIdentity: model,
      readerArchitectureVariant: "case_wide",
    });
    const legacyIdempotencyKey = computeAgenticReaderQualificationIdempotencyKey({
      caseId: CASE_A,
      domainId: prompt.artifact.domainId,
      domainPackId: prompt.artifact.domainPackId,
      domainPackVersion: prompt.artifact.domainPackVersion,
      documentFingerprint: fingerprintRegisteredSourceDocuments(
        L001_QUALIFICATION_SOURCE_SHA256,
      ),
      engine: legacyEngine,
    });
    const legacyRunId = "99999999-9999-4999-8999-999999999999";
    studyRuns.push({
      id: legacyRunId,
      case_id: CASE_A,
      user_id: USER_A,
      idempotency_key: legacyIdempotencyKey,
      study_context_id: legacyRunId,
      domain_id: prompt.artifact.domainId,
      domain_pack_id: prompt.artifact.domainPackId,
      domain_pack_version: prompt.artifact.domainPackVersion,
      question_set_version: AGENTIC_READER_QUALIFICATION_QUESTION_SET_VERSION,
      answer_snapshot_hash: AGENTIC_READER_QUALIFICATION_ANSWER_SNAPSHOT_HASH,
      engine_provider: model.providerId,
      provider_mode: model.providerMode,
      prompt_id: "reader-experiment/architecture/case_wide",
      prompt_version: `${hashes.promptVersion}+case_wide`,
      prompt_sha256: hashes.sharedPromptSha256,
      started_at: "2026-10-09T00:00:00.000Z",
      status: "SUCCEEDED",
    });

    const ensured = await ensureAgenticReaderQualificationRun({
      env: {
        ...READER_QUALIFICATION_MODEL_ENV,
        HIVE_READER_ARCHITECTURE_VARIANT: "case_wide",
      },
      gateway,
      caseId: CASE_A,
      userId: USER_A,
    });

    expect(ensured.idempotencyKey).not.toBe(legacyIdempotencyKey);
    expect(ensured.run.studyRunId).not.toBe(legacyRunId);
    expect(studyRuns.some((row) => row.id === legacyRunId && row.status === "SUCCEEDED")).toBe(true);
    expect(studyRuns.filter((row) => row.case_id === CASE_A)).toHaveLength(2);
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

  it("run preserves document load error codes", async () => {
    const { gateway } = createStatefulGateway({
      caseUserId: USER_A,
      sourceDocuments: l001SourceDocuments(USER_A),
    });
    await ensureAgenticReaderQualificationRun({
      gateway,
      caseId: CASE_A,
      userId: USER_A,
      env: READER_QUALIFICATION_MODEL_ENV,
    });
    const result = await runAgenticReaderQualification({
      env: READER_QUALIFICATION_MODEL_ENV,
      gateway,
      documentPagesBucket: "document-pages",
      caseId: CASE_A,
      userId: USER_A,
      readerClient: vi.fn(),
    });
    expect(result.outcome).toBe("failed");
    if (result.outcome !== "failed") {
      throw new Error("expected failed outcome");
    }
    expect(result.code).toBe("DOCUMENT_PAGES_CACHE_MISSING");
  });

  it("run preserves reader HTTP error codes from hive-agents", async () => {
    const { gateway } = createStatefulGateway({
      caseUserId: USER_A,
      sourceDocuments: l001SourceDocuments(USER_A),
      objects: l001CachedObjects(USER_A),
    });
    await ensureAgenticReaderQualificationRun({
      gateway,
      caseId: CASE_A,
      userId: USER_A,
      env: READER_QUALIFICATION_MODEL_ENV,
    });
    const result = await runAgenticReaderQualification({
      env: READER_QUALIFICATION_MODEL_ENV,
      gateway,
      documentPagesBucket: "document-pages",
      caseId: CASE_A,
      userId: USER_A,
      readerClient: vi.fn(async () => {
        throw new ReaderHttpInvocationError(422, "ENGINE1_CONTEXT_MISMATCH");
      }),
    });
    expect(result.outcome).toBe("failed");
    if (result.outcome !== "failed") {
      throw new Error("expected failed outcome");
    }
    expect(result.code).toBe("ENGINE1_CONTEXT_MISMATCH");
  });

  it("run reports engine1 context stage failures without masking", async () => {
    const base = createStatefulGateway({
      caseUserId: USER_A,
      sourceDocuments: l001SourceDocuments(USER_A),
      objects: l001CachedObjects(USER_A),
    });
    const selectWhere = base.gateway.selectWhere.bind(base.gateway);
    base.gateway.selectWhere = async (table, where, options) => {
      if (table === "discover_artifacts") {
        throw new Error("discover artifacts unavailable");
      }
      return selectWhere(table, where, options);
    };
    await ensureAgenticReaderQualificationRun({
      gateway: base.gateway,
      caseId: CASE_A,
      userId: USER_A,
      env: READER_QUALIFICATION_MODEL_ENV,
    });
    const result = await runAgenticReaderQualification({
      env: READER_QUALIFICATION_MODEL_ENV,
      gateway: base.gateway,
      documentPagesBucket: "document-pages",
      caseId: CASE_A,
      userId: USER_A,
      readerClient: vi.fn(),
    });
    expect(result.outcome).toBe("failed");
    if (result.outcome !== "failed") {
      throw new Error("expected failed outcome");
    }
    expect(result.code).toBe("ENGINE1_CONTEXT_FAILED");
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
    const { gateway, traceEvents } = createStatefulGateway({
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
    expect(zeroAccepted.code).toBe("READER_TRACE_CORRELATION_FAILED");

    const withoutEvidence = await runAgenticReaderQualification({
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
            event_payload: {},
          },
          {
            study_run_id: request.studyRunId,
            attempt_id: request.attemptId,
            event_type: "COMPLETED",
            case_id: CASE_A,
            user_id: USER_A,
            sequence_number: 1,
            event_payload: {
              acceptedFactCount: 0,
              candidateFactCount: 2,
              candidatesWithEvidenceCount: 0,
              readerDiagnosticOutcome: "CANDIDATES_WITHOUT_EVIDENCE",
            },
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
    expect(withoutEvidence.outcome).toBe("failed");
    if (withoutEvidence.outcome === "failed") {
      expect(withoutEvidence.code).toBe("READER_CANDIDATES_WITHOUT_EVIDENCE");
    }
  });

  it("run succeeds with persisted audit and correlated trace acceptance", async () => {
    const { gateway, traceEvents, uploadedObjects } = createStatefulGateway({
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
            event_payload: { acceptedFactCount: 1 },
          },
        );
        return {
          schemaVersion: "study-reader/1",
          candidateFacts: [
            {
              id: "fact-1",
              construct: { measure: "reading" },
              value: { kind: "text", textValue: "Hello" },
              modality: "observed",
              evidence: [{ sourceDocumentId: "doc-a", page: 1, quote: "Hello" }],
            },
            {
              id: "fact-rejected",
              construct: { measure: "other" },
              value: { kind: "text", textValue: "Rejected" },
              modality: "observed",
              evidence: [{ sourceDocumentId: "doc-a", page: 1, quote: "Rejected" }],
            },
          ],
          acceptedCandidateFacts: [
            {
              id: "fact-1",
              construct: { measure: "reading" },
              value: { kind: "text", textValue: "Hello" },
              modality: "observed",
              evidence: [{ sourceDocumentId: "doc-a", page: 1, quote: "Hello" }],
            },
          ],
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
    if (result.outcome !== "succeeded") {
      throw new Error("expected succeeded outcome");
    }
    const artifactPath = readerAcceptedFactsStoragePath(USER_A, result.run.studyRunId);
    expect(result.acceptedFactsArtifactPath).toBe(artifactPath);
    const stored = uploadedObjects.get(artifactPath);
    expect(stored).toBeDefined();
    const artifact = JSON.parse(new TextDecoder().decode(stored!));
    expect(artifact.schemaVersion).toBe(READER_ACCEPTED_FACTS_SCHEMA_VERSION);
    expect(artifact.attemptId).toBe(result.attemptId);
    expect(artifact.facts).toHaveLength(1);
    expect(artifact.facts[0].id).toBe("fact-1");
  });

  it("run ignores failed retry trace when grading attempt counts", async () => {
    const { gateway, traceEvents, uploadedObjects } = createStatefulGateway({
      caseUserId: USER_A,
      sourceDocuments: l001SourceDocuments(USER_A),
      objects: l001CachedObjects(USER_A),
    });
    await ensureAgenticReaderQualificationRun({ gateway, caseId: CASE_A, userId: USER_A, env: READER_QUALIFICATION_MODEL_ENV });

    const failedAttempt = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    traceEvents.push(
      {
        study_run_id: "placeholder",
        attempt_id: failedAttempt,
        event_type: "STARTED",
        case_id: CASE_A,
        user_id: USER_A,
        sequence_number: 0,
      },
      {
        study_run_id: "placeholder",
        attempt_id: failedAttempt,
        event_type: "EVIDENCE_ACCEPTED",
        case_id: CASE_A,
        user_id: USER_A,
        sequence_number: 1,
      },
      {
        study_run_id: "placeholder",
        attempt_id: failedAttempt,
        event_type: "EVIDENCE_ACCEPTED",
        case_id: CASE_A,
        user_id: USER_A,
        sequence_number: 2,
      },
    );

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
            sequence_number: 10,
          },
          {
            study_run_id: request.studyRunId,
            attempt_id: request.attemptId,
            event_type: "EVIDENCE_ACCEPTED",
            case_id: CASE_A,
            user_id: USER_A,
            sequence_number: 11,
          },
          {
            study_run_id: request.studyRunId,
            attempt_id: request.attemptId,
            event_type: "COMPLETED",
            case_id: CASE_A,
            user_id: USER_A,
            sequence_number: 12,
            event_payload: { acceptedFactCount: 1 },
          },
        );
        return {
          schemaVersion: "study-reader/1",
          candidateFacts: [{ id: "fact-1" }],
          acceptedCandidateFacts: [
            {
              id: "fact-1",
              construct: { measure: "reading" },
              value: { kind: "text", textValue: "Hello" },
              modality: "observed",
              evidence: [{ sourceDocumentId: "doc-a", page: 1, quote: "Hello" }],
            },
          ],
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
    if (result.outcome !== "succeeded") {
      throw new Error("expected succeeded");
    }
    expect(result.acceptedEvidenceEvents).toBe(1);
    expect(uploadedObjects.size).toBeGreaterThan(0);
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

describe("pack-driven Engine 1 boundary", () => {
  it("includes advisory Discover labels without pack documentTypeId in engine1ReaderContextJson", async () => {
    const { resolveEngine1ReaderContext, serializeEngine1ReaderContext } = await import(
      "./engine1-reader-context.js"
    );
    const structureMap = {
      schemaVersion: "hive.structure-map/1",
      discoverRunId: "intake-1",
      caseId: CASE_A,
      producedAt: "2026-01-01T00:00:00.000Z",
      domainResolution: {
        status: "SINGLE_DOMAIN",
        domainLabel: "Special education records",
        domainId: "iep",
        domainPackId: "domain-pack/iep",
        domainPackVersion: "0.0.0-test",
      },
      domainGroups: [],
      sourceDocuments: [
        { sourceDocumentId: "src-1", originalFilename: "iep.pdf", sizeBytes: 1, sha256: "abc" },
      ],
      logicalDocuments: [
        {
          id: "logic-1",
          domainId: "iep",
          sourceDocumentId: "src-1",
          pageStart: 1,
          pageEnd: 4,
          documentType: "IEP",
          title: "Individualized Education Program",
          groupId: "uploaded_evidence",
          recognitionStatus: "recognized",
          sequenceOrder: 1,
          provenance: "UPLOADED_EVIDENCE",
        },
      ],
      relationships: [],
      chronology: [],
      discoveryAnswers: [],
      unresolved: [],
      completeness: { status: "complete", expectations: [] },
      provenance: {
        promptVersion: "intake-pack-execution",
        promptSha256: "deadbeef",
        providerId: "intake-domain-pack",
      },
    } as unknown as import("@hiveforyou/shared/discover/structure-map").StructureMap;

    const context = await resolveEngine1ReaderContext({
      gateway: { selectWhere: async () => [] } as never,
      userId: USER_A,
      caseId: CASE_A,
      domainId: "iep",
      domainPackId: "domain-pack/iep",
      domainPackVersion: "0.0.0-test",
      registeredDocuments: [{ id: "src-1", sha256: "abc", filename: "iep.pdf" }],
      structureMap,
      requirePersistedDiscover: true,
    });

    const parsed = JSON.parse(serializeEngine1ReaderContext(context)) as {
      logicalDocuments: Array<Record<string, unknown>>;
    };
    expect(context.provenance).toBe("intake_pack_execution");
    expect(parsed.logicalDocuments[0]).not.toHaveProperty("documentType");
    expect(parsed.logicalDocuments[0]).not.toHaveProperty("documentTypeId");
    expect(parsed.logicalDocuments[0]?.discoverDocumentTypeLabel).toBe("IEP");
  });

  it("ensureDiscoverForPackDrivenStudy uses Intake pack execution without OpenAI Discover", async () => {
    const { assembleIntakeStudyRequest } = await import("@hiveforyou/core");
    const { ensureDiscoverForPackDrivenStudy } = await import(
      "./ensure-discover-for-pack-driven-study.js"
    );
    const packExecutionJson = JSON.stringify({
      schemaVersion: "intake-pack-execution/1",
      domainPackId: "domain-pack/iep",
      domainPackVersion: "0.0.0-test",
      logicalDocuments: [
        {
          logicalDocumentId: "logic-1",
          sourceDocumentId: "src-1",
          pageStart: 1,
          pageEnd: 2,
          documentFamily: "IEP",
          documentSubtype: null,
          processingDisposition: "PROCESS",
          classificationConfidence: 0.9,
          classificationReason: "test",
          customerLabel: "Individualized Education Program",
        },
      ],
      completeness: { expectations: [], collectionNeedsReview: false },
    });
    const request = assembleIntakeStudyRequest({
      caseId: CASE_A,
      intakeRunId: "intake-1",
      domainId: "iep",
      domainLabel: "Special education records",
      domainPackVersion: "0.0.0-test",
      packExecution: JSON.parse(packExecutionJson),
      sources: [
        {
          id: "src-1",
          caseId: CASE_A,
          userId: USER_A,
          clientStagedId: null,
          originalFilename: "iep.pdf",
          mimeType: "application/pdf",
          sizeBytes: 100,
          sha256: "abc",
          storageBucket: "b",
          storagePath: "p",
          status: "stored",
          intakeRunId: "intake-1",
          studyRunId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      identities: [{ sourceDocumentId: "src-1", analysisDisposition: "PRESENT" }],
    });

    const outcome = await ensureDiscoverForPackDrivenStudy({
      gateway: { selectWhere: async () => [] } as never,
      intake: {
        getById: async () => ({
          id: "intake-1",
          caseId: CASE_A,
          resolvedDomainId: "iep",
          rawIntent: "Special education records",
          packExecutionJson,
        }),
        listByRun: async () => [{ sourceDocumentId: "src-1", analysisDisposition: "PRESENT" }],
      } as never,
      documents: {
        listByCase: async () => [
          {
            id: "src-1",
            sha256: "abc",
            originalFilename: "iep.pdf",
            sizeBytes: 100,
            mimeType: "application/pdf",
            storageBucket: "b",
            storagePath: "p",
          },
        ],
      } as never,
      userId: USER_A,
      caseId: CASE_A,
      intakeRunId: "intake-1",
      domainId: "iep",
      request,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.engine1Source).toBe("intake_pack_execution");
    expect(outcome.structureMap.provenance?.providerId).toBe("intake-domain-pack");
  });
});

describe("runProductionPackDrivenReader ARCH-03 raw extraction", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const EIGHT = ["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8"] as const;
  const PROPOSAL_PACK_BINDING = {
    packId: "iep",
    packVersion: "0.3.0-proposed",
    packContentSha256: L001_READER_PACK_CONTENT_SHA256,
  } as const;

  function packDrivenProductionContext(): CanonicalStudyContext {
    return {
      caseId: "case-1",
      studyRunId: "study-1",
      domainId: "iep",
      domainPackId: "hive.domain.iep",
      domainPackVersion: "0.0.0-scaffold",
      processingPolicy: {
        processingMode: "pack_driven_v1",
        proposalPackContentSha256: L001_READER_PACK_CONTENT_SHA256,
      },
    } as CanonicalStudyContext;
  }

  function productionGateway(): HiveGateway {
    const objects = new Map<string, Uint8Array>();
    return {
      selectWhere: vi.fn(async () => []),
      uploadObject: vi.fn(async (_bucket: string, path: string, bytes: Uint8Array) => {
        objects.set(path, bytes);
      }),
      downloadObject: vi.fn(async (_bucket: string, path: string) => {
        const value = objects.get(path);
        if (!value) {
          throw new Error("NOT_FOUND");
        }
        return value;
      }),
    } as unknown as HiveGateway;
  }

  function extractionEnvelope(
    sourceDocumentId: string,
    attemptId: string,
    status: "SUCCEEDED" | "MODEL_ERROR",
  ) {
    return {
      schemaVersion: READER_DOCUMENT_EXTRACTION_SCHEMA_VERSION,
      studyRunId: "study-1",
      attemptId,
      caseId: "case-1",
      userId: USER_A,
      sourceDocumentId,
      domainId: "iep",
      packId: "iep",
      packVersion: "0.3.0-proposed",
      packContentSha256: "a".repeat(64),
      promptVersion: "hive-pack-driven-reader/0.2.0",
      modelProvider: "anthropic",
      modelId: "claude-test",
      status,
      occurredAt: "2026-10-12T12:00:00Z",
      rawAssistantText: status === "SUCCEEDED" ? '{"documentTypeId":"iep.plan"}' : "err",
      parsedModelJson: status === "SUCCEEDED" ? { documentTypeId: "iep.plan" } : undefined,
    };
  }

  it("succeeds for eight simulated documents with zero accepted verifier facts", async () => {
    vi.spyOn(loadPages, "loadTrustedDocumentPageBundle").mockResolvedValue(
      EIGHT.map((sourceDocumentId) => ({
        sourceDocumentId,
        documentPages: { pages: [{ pageNumber: 1, words: [{ seq: 0, text: "x" }] }] },
      })) as never,
    );
    vi.spyOn(engine1, "resolveEngine1ReaderContext").mockResolvedValue({
      provenance: "persisted_discover_structure_map",
      resolvedDomainId: "iep",
      domainPackId: "hive.domain.iep",
      domainPackVersion: "0.0.0-scaffold",
      logicalDocuments: EIGHT.map((sourceDocumentId) => ({
        sourceDocumentId,
        filename: `${sourceDocumentId}.pdf`,
        pageCount: 1,
        documentTypeId: "iep.plan",
      })),
    } as never);
    vi.spyOn(engine1, "serializeEngine1ReaderContext").mockReturnValue("{}");
    vi.spyOn(coreStudy, "loadAgenticReaderQualificationPromptMetadata").mockReturnValue({
      promptSha256: "abc".repeat(21).slice(0, 64),
    } as never);
    vi.spyOn(coreStudy, "resolveStudyReaderProposalPackBindingFromContext").mockReturnValue(
      PROPOSAL_PACK_BINDING,
    );

    const readerClient = vi.fn(async (request) => ({
      schemaVersion: "study-reader/1" as const,
      caseId: "case-1",
      domainId: "iep",
      packVersion: "0.0.0-scaffold",
      candidateFacts: [],
      acceptedCandidateFacts: [],
      reasoningSteps: 0,
      toolCalls: 0,
      documentExtractions: EIGHT.map((sourceDocumentId) =>
        extractionEnvelope(sourceDocumentId, request.attemptId, "SUCCEEDED"),
      ),
      perDocumentResults: EIGHT.map((sourceDocumentId) => ({
        sourceDocumentId,
        documentTypeId: "iep.plan",
        engine1DocumentTypeId: "iep.plan",
        classificationNeedsReview: false,
        parseOk: true,
        parseErrors: [],
      })),
      audit: {
        studyRunId: request.studyRunId,
        attemptId: request.attemptId,
        persisted: true,
        status: "persisted",
      },
    }));

    const result = await runProductionPackDrivenReader({
      gateway: productionGateway(),
      documentPagesBucket: "document-pages",
      context: packDrivenProductionContext(),
      userId: USER_A,
      registeredDocuments: EIGHT.map((id) => ({ id, sha256: "a".repeat(64) })),
      readerClient,
      attemptId: "attempt-eight",
    });

    expect(result.rawExtractionOutcome).toBe("succeeded");
    expect(result.acceptedVerifierFactCount).toBe(0);
    expect(readerClient.mock.calls[0]?.[0]?.readerMode).toBe("pack_driven");
  });

  it("fail-closes when any document has parse or extraction failure", async () => {
    vi.spyOn(loadPages, "loadTrustedDocumentPageBundle").mockResolvedValue(
      EIGHT.map((sourceDocumentId) => ({
        sourceDocumentId,
        documentPages: { pages: [{ pageNumber: 1, words: [{ seq: 0, text: "x" }] }] },
      })) as never,
    );
    vi.spyOn(engine1, "resolveEngine1ReaderContext").mockResolvedValue({
      provenance: "persisted_discover_structure_map",
      resolvedDomainId: "iep",
      domainPackId: "hive.domain.iep",
      domainPackVersion: "0.0.0-scaffold",
      logicalDocuments: EIGHT.map((sourceDocumentId) => ({
        sourceDocumentId,
        filename: `${sourceDocumentId}.pdf`,
        pageCount: 1,
        documentTypeId: "iep.plan",
      })),
    } as never);
    vi.spyOn(engine1, "serializeEngine1ReaderContext").mockReturnValue("{}");
    vi.spyOn(coreStudy, "loadAgenticReaderQualificationPromptMetadata").mockReturnValue({
      promptSha256: "abc".repeat(21).slice(0, 64),
    } as never);
    vi.spyOn(coreStudy, "resolveStudyReaderProposalPackBindingFromContext").mockReturnValue(
      PROPOSAL_PACK_BINDING,
    );

    const readerClient = vi.fn(async (request) => ({
      schemaVersion: "study-reader/1" as const,
      caseId: "case-1",
      domainId: "iep",
      packVersion: "0.0.0-scaffold",
      candidateFacts: [],
      acceptedCandidateFacts: [],
      reasoningSteps: 0,
      toolCalls: 0,
      documentExtractions: EIGHT.map((sourceDocumentId, index) =>
        extractionEnvelope(
          sourceDocumentId,
          request.attemptId,
          index === 4 ? "MODEL_ERROR" : "SUCCEEDED",
        ),
      ),
      perDocumentResults: EIGHT.map((sourceDocumentId, index) => ({
        sourceDocumentId,
        documentTypeId: "iep.plan",
        engine1DocumentTypeId: "iep.plan",
        classificationNeedsReview: false,
        parseOk: index !== 4,
        parseErrors: index === 4 ? ["model_error"] : [],
      })),
      audit: {
        studyRunId: request.studyRunId,
        attemptId: request.attemptId,
        persisted: true,
        status: "persisted",
      },
    }));

    await expect(
      runProductionPackDrivenReader({
        gateway: productionGateway(),
        documentPagesBucket: "document-pages",
        context: packDrivenProductionContext(),
        userId: USER_A,
        registeredDocuments: EIGHT.map((id) => ({ id, sha256: "a".repeat(64) })),
        readerClient,
      }),
    ).rejects.toBeInstanceOf(PackDrivenReaderProductionError);
  });

  it("persists extractions before surfacing audit failure", async () => {
    vi.spyOn(loadPages, "loadTrustedDocumentPageBundle").mockResolvedValue([
      {
        sourceDocumentId: "doc-a",
        documentPages: { pages: [{ pageNumber: 1, words: [{ seq: 0, text: "x" }] }] },
      },
    ] as never);
    vi.spyOn(engine1, "resolveEngine1ReaderContext").mockResolvedValue({
      provenance: "persisted_discover_structure_map",
      resolvedDomainId: "iep",
      domainPackId: "hive.domain.iep",
      domainPackVersion: "0.0.0-scaffold",
      logicalDocuments: [
        {
          sourceDocumentId: "doc-a",
          filename: "plan.pdf",
          pageCount: 1,
          documentTypeId: "iep.plan",
        },
      ],
    } as never);
    vi.spyOn(engine1, "serializeEngine1ReaderContext").mockReturnValue("{}");
    vi.spyOn(coreStudy, "loadAgenticReaderQualificationPromptMetadata").mockReturnValue({
      promptSha256: "abc".repeat(21).slice(0, 64),
    } as never);
    vi.spyOn(coreStudy, "resolveStudyReaderProposalPackBindingFromContext").mockReturnValue(
      PROPOSAL_PACK_BINDING,
    );

    const readerClient = vi.fn(async (request) => ({
      schemaVersion: "study-reader/1" as const,
      caseId: "case-1",
      domainId: "iep",
      packVersion: "0.0.0-scaffold",
      candidateFacts: [],
      acceptedCandidateFacts: [],
      reasoningSteps: 0,
      toolCalls: 0,
      documentExtractions: [extractionEnvelope("doc-a", request.attemptId, "SUCCEEDED")],
      perDocumentResults: [
        {
          sourceDocumentId: "doc-a",
          documentTypeId: "iep.plan",
          engine1DocumentTypeId: "iep.plan",
          classificationNeedsReview: false,
          parseOk: true,
          parseErrors: [],
        },
      ],
      audit: {
        studyRunId: request.studyRunId,
        attemptId: request.attemptId,
        persisted: false,
        status: "failed",
        errorCode: "TRACE_PERSIST_FAILED",
      },
    }));

    await expect(
      runProductionPackDrivenReader({
        gateway: productionGateway(),
        documentPagesBucket: "document-pages",
        context: packDrivenProductionContext(),
        userId: USER_A,
        registeredDocuments: [{ id: "doc-a", sha256: "a".repeat(64) }],
        readerClient,
      }),
    ).rejects.toBeInstanceOf(PackDrivenReaderAuditNotPersistedError);
  });
});

describe("runProductionPackDrivenReader env handoff", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const REQUIRED_WORKER_ENV = {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    HIVE_STORAGE_BUCKET: "case-documents",
  } as const;
  const UNREGISTERED_SNAPSHOT_HASH = "b".repeat(64);
  const OVERRIDE_SNAPSHOT_HASH = IEP_CANDIDATE_READER_PACK_CONTENT_SHA256;
  const tempRoots: string[] = [];
  const envSnapshot = { ...process.env };

  function workerEnvStrings(env: ReturnType<typeof readWorkerEnv>): Record<string, string | undefined> {
    return env as unknown as Record<string, string | undefined>;
  }

  function writeSnapshotManifest(brainRoot: string, packContentSha256: string): void {
    const snapshotsDir = join(brainRoot, "iep", "snapshots");
    mkdirSync(snapshotsDir, { recursive: true });
    writeFileSync(
      join(snapshotsDir, "manifest.json"),
      JSON.stringify(
        {
          schemaVersion: "hive.domain-pack.proposal-snapshots/1",
          snapshots: [
            {
              packId: "iep",
              packVersion: "0.3.0-proposed",
              packContentSha256,
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );
    const snapshotPath = join(snapshotsDir, `${packContentSha256}.json`);
    if (!existsSync(snapshotPath)) {
      const repoSnapshot = join(
        process.cwd(),
        "..",
        "brain",
        "domain-packs",
        "iep",
        "snapshots",
        `${packContentSha256}.json`,
      );
      if (existsSync(repoSnapshot)) {
        copyFileSync(repoSnapshot, snapshotPath);
      }
    }
  }

  function tempBrainRoot(packContentSha256: string): string {
    const root = mkdtempSync(join(tmpdir(), "hive-brain-packs-"));
    tempRoots.push(root);
    writeSnapshotManifest(root, packContentSha256);
    return root;
  }

  function envHandoffGateway(): HiveGateway {
    return {
      selectWhere: vi.fn(async () => []),
      uploadObject: vi.fn(async () => undefined),
      downloadObject: vi.fn(async () => new Uint8Array()),
    } as unknown as HiveGateway;
  }

  function packDrivenContext(proposalPackContentSha256: string): CanonicalStudyContext {
    return {
      caseId: "case-1",
      studyRunId: "study-1",
      domainId: "iep",
      domainPackId: "hive.domain.iep",
      domainPackVersion: "0.0.0-scaffold",
      processingPolicy: {
        processingMode: "pack_driven_v1",
        providerId: "pack-driven-reader",
        providerMode: "reader_delegated",
        proposalPackContentSha256,
      },
    } as CanonicalStudyContext;
  }

  function stubReaderPipeline(): ReturnType<typeof vi.fn> {
    vi.spyOn(loadPages, "loadTrustedDocumentPageBundle").mockResolvedValue([
      {
        sourceDocumentId: "doc-1",
        documentPages: { pages: [{ pageNumber: 1, words: [{ seq: 0, text: "x" }] }] },
      },
    ] as never);
    vi.spyOn(engine1, "resolveEngine1ReaderContext").mockResolvedValue({
      provenance: "persisted_discover_structure_map",
      resolvedDomainId: "iep",
      domainPackId: "hive.domain.iep",
      domainPackVersion: "0.0.0-scaffold",
      logicalDocuments: [
        {
          sourceDocumentId: "doc-1",
          filename: "doc-1.pdf",
          pageCount: 1,
          documentTypeId: "iep.plan",
        },
      ],
    } as never);
    vi.spyOn(engine1, "serializeEngine1ReaderContext").mockReturnValue("{}");
    vi.spyOn(coreStudy, "loadAgenticReaderQualificationPromptMetadata").mockReturnValue({
      promptSha256: L001_READER_PACK_CONTENT_SHA256,
    } as never);

    return vi.fn(async (request) => ({
      schemaVersion: "study-reader/1" as const,
      caseId: request.caseId,
      domainId: "iep",
      packVersion: "0.3.0-proposed",
      candidateFacts: [],
      acceptedCandidateFacts: [],
      reasoningSteps: 0,
      toolCalls: 0,
      documentExtractions: [
        {
          schemaVersion: READER_DOCUMENT_EXTRACTION_SCHEMA_VERSION,
          studyRunId: request.studyRunId,
          attemptId: request.attemptId,
          caseId: request.caseId,
          userId: request.userId,
          sourceDocumentId: "doc-1",
          domainId: "iep",
          packId: "iep",
          packVersion: "0.3.0-proposed",
          packContentSha256: request.packContentSha256,
          promptVersion: "hive-pack-driven-reader/0.2.0",
          modelProvider: "anthropic",
          modelId: "claude-test",
          status: "SUCCEEDED",
          occurredAt: "2026-10-12T12:00:00Z",
          rawAssistantText: '{"documentTypeId":"iep.plan"}',
          parsedModelJson: { documentTypeId: "iep.plan" },
        },
      ],
      perDocumentResults: [
        {
          sourceDocumentId: "doc-1",
          documentTypeId: "iep.plan",
          engine1DocumentTypeId: "iep.plan",
          classificationNeedsReview: false,
          parseOk: true,
          parseErrors: [],
        },
      ],
      audit: {
        studyRunId: request.studyRunId,
        attemptId: request.attemptId,
        persisted: true,
        status: "persisted",
      },
    }));
  }

  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
    process.env = { ...envSnapshot };
  });

  it("keeps HIVE_DOMAIN_PACKS_BRAIN_DIR from process.env when input.env is filtered WorkerEnv", async () => {
    const brainRoot = tempBrainRoot(L001_READER_PACK_CONTENT_SHA256);
    process.env.HIVE_DOMAIN_PACKS_BRAIN_DIR = brainRoot;

    const filteredEnv = workerEnvStrings(
      readWorkerEnv({
        ...REQUIRED_WORKER_ENV,
        HIVE_PACK_DRIVEN_READER_PROPOSAL_JSON: "/app/pack/iep-pack.v0.3.proposed.json",
      }),
    );
    expect(filteredEnv.HIVE_DOMAIN_PACKS_BRAIN_DIR).toBeUndefined();

    const bindingSpy = vi.spyOn(coreStudy, "resolveStudyReaderProposalPackBindingFromContext");
    const readerClient = stubReaderPipeline();

    await runProductionPackDrivenReader({
      gateway: envHandoffGateway(),
      documentPagesBucket: "document-pages",
      context: packDrivenContext(L001_READER_PACK_CONTENT_SHA256),
      userId: USER_A,
      registeredDocuments: [{ id: "doc-1", sha256: "a".repeat(64) }],
      env: filteredEnv,
      readerClient,
      attemptId: "attempt-env-handoff",
    });

    expect(bindingSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        env: expect.objectContaining({
          HIVE_DOMAIN_PACKS_BRAIN_DIR: brainRoot,
          HIVE_READER_MODE: "pack_driven",
        }),
      }),
    );
    expect(readerClient.mock.calls[0]?.[0]?.packContentSha256).toBe(L001_READER_PACK_CONTENT_SHA256);
  });

  it("binds the frozen study hash to the immutable snapshot manifest entry", async () => {
    const brainRoot = tempBrainRoot(L001_READER_PACK_CONTENT_SHA256);
    process.env.HIVE_DOMAIN_PACKS_BRAIN_DIR = brainRoot;

    const readerClient = stubReaderPipeline();
    await runProductionPackDrivenReader({
      gateway: envHandoffGateway(),
      documentPagesBucket: "document-pages",
      context: packDrivenContext(L001_READER_PACK_CONTENT_SHA256),
      userId: USER_A,
      registeredDocuments: [{ id: "doc-1", sha256: "a".repeat(64) }],
      env: workerEnvStrings(readWorkerEnv(REQUIRED_WORKER_ENV)),
      readerClient,
      attemptId: "attempt-frozen-hash",
    });

    expect(readerClient.mock.calls[0]?.[0]?.packId).toBe("iep");
    expect(readerClient.mock.calls[0]?.[0]?.packVersion).toBe("0.3.0-proposed");
    expect(readerClient.mock.calls[0]?.[0]?.packContentSha256).toBe(L001_READER_PACK_CONTENT_SHA256);
  });

  it("lets explicit input.env override container-level HIVE_DOMAIN_PACKS_BRAIN_DIR", async () => {
    const containerBrain = tempBrainRoot(L001_READER_PACK_CONTENT_SHA256);
    const overrideBrain = tempBrainRoot(OVERRIDE_SNAPSHOT_HASH);
    process.env.HIVE_DOMAIN_PACKS_BRAIN_DIR = containerBrain;

    const readerClient = stubReaderPipeline();
    await runProductionPackDrivenReader({
      gateway: envHandoffGateway(),
      documentPagesBucket: "document-pages",
      context: packDrivenContext(OVERRIDE_SNAPSHOT_HASH),
      userId: USER_A,
      registeredDocuments: [{ id: "doc-1", sha256: "a".repeat(64) }],
      env: {
        ...workerEnvStrings(readWorkerEnv(REQUIRED_WORKER_ENV)),
        HIVE_DOMAIN_PACKS_BRAIN_DIR: overrideBrain,
      },
      readerClient,
      attemptId: "attempt-override",
    });

    expect(readerClient.mock.calls[0]?.[0]?.packContentSha256).toBe(OVERRIDE_SNAPSHOT_HASH);
  });

  it("rejects a frozen hash that is not registered in the manifest", async () => {
    const brainRoot = tempBrainRoot(L001_READER_PACK_CONTENT_SHA256);
    process.env.HIVE_DOMAIN_PACKS_BRAIN_DIR = brainRoot;

    const readerClient = stubReaderPipeline();
    await expect(
      runProductionPackDrivenReader({
        gateway: envHandoffGateway(),
        documentPagesBucket: "document-pages",
        context: packDrivenContext(UNREGISTERED_SNAPSHOT_HASH),
        userId: USER_A,
        registeredDocuments: [{ id: "doc-1", sha256: "a".repeat(64) }],
        env: workerEnvStrings(readWorkerEnv(REQUIRED_WORKER_ENV)),
        readerClient,
        attemptId: "attempt-no-fallback",
      }),
    ).rejects.toThrow(ReaderProposalPackBindingError);

    expect(readerClient).not.toHaveBeenCalled();
  });

  it("fail-closes before Reader HTTP when registry digest is unknown", async () => {
    const brainRoot = tempBrainRoot(L001_READER_PACK_CONTENT_SHA256);
    process.env.HIVE_DOMAIN_PACKS_BRAIN_DIR = brainRoot;

    const readerClient = stubReaderPipeline();
    await expect(
      runProductionPackDrivenReader({
        gateway: envHandoffGateway(),
        documentPagesBucket: "document-pages",
        context: packDrivenContext(UNREGISTERED_SNAPSHOT_HASH),
        userId: USER_A,
        registeredDocuments: [{ id: "doc-1", sha256: "a".repeat(64) }],
        env: workerEnvStrings(readWorkerEnv(REQUIRED_WORKER_ENV)),
        readerClient,
        attemptId: "attempt-registry-unknown",
      }),
    ).rejects.toThrow(ReaderProposalPackBindingError);

    expect(readerClient).not.toHaveBeenCalled();
  });
});
