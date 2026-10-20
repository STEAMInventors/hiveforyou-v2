import { describe, expect, it, vi } from "vitest";

import type { ProposalDomainPack } from "@hiveforyou/domain-pack/pack-driven-reader";
import {
  PACK_DRIVEN_READER_EXTRACTION_SCHEMA_VERSION,
  PACK_DRIVEN_READER_PROMPT_VERSION,
} from "@hiveforyou/domain-pack/pack-driven-reader";
import {
  packDrivenReaderDocumentRawArtifactPath,
  packDrivenReaderStudyManifestArtifactPath,
} from "@hiveforyou/shared/hive-artifact-paths";
import { READER_DOCUMENT_EXTRACTION_SCHEMA_VERSION } from "@hiveforyou/shared/reader-document-extraction";

import type { HiveGateway } from "../persistence/hive-gateway.js";
import {
  PackDrivenReaderArtifactStorage,
  ReaderDocumentExtractionStorage,
} from "./reader-document-extraction-storage.js";

const USER = "user-1";
const STUDY = "study-1";
const ATTEMPT = "attempt-1";
const CASE = "case-1";

function sampleEnvelope(sourceDocumentId: string, status: "SUCCEEDED" | "INVALID_JSON" | "MODEL_ERROR") {
  return {
    schemaVersion: READER_DOCUMENT_EXTRACTION_SCHEMA_VERSION,
    studyRunId: STUDY,
    attemptId: ATTEMPT,
    caseId: CASE,
    userId: USER,
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
    rawAssistantText: status === "SUCCEEDED" ? '{"documentTypeId":"iep.plan"}' : "broken",
    parsedModelJson: status === "SUCCEEDED" ? { documentTypeId: "iep.plan" } : undefined,
  };
}

function createGateway(initial: Record<string, Uint8Array> = {}): HiveGateway {
  const objects = new Map<string, Uint8Array>(Object.entries(initial));
  return {
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

describe("ReaderDocumentExtractionStorage", () => {
  it("persists successful and failed sibling documents independently", async () => {
    const gateway = createGateway();
    const storage = new ReaderDocumentExtractionStorage(gateway, "document-pages");
    const result = await storage.persistAttemptEnvelopes({
      userId: USER,
      updatedAt: "2026-10-12T12:00:00Z",
      envelopes: [sampleEnvelope("doc-ok", "SUCCEEDED"), sampleEnvelope("doc-bad", "INVALID_JSON")],
    });
    expect(result.envelopePaths).toHaveLength(2);
    const ok = await storage.loadEnvelope(USER, STUDY, ATTEMPT, "doc-ok");
    const bad = await storage.loadEnvelope(USER, STUDY, ATTEMPT, "doc-bad");
    expect(ok?.status).toBe("SUCCEEDED");
    expect(bad?.status).toBe("INVALID_JSON");
  });

  it("rejects immutable attempt conflicts", async () => {
    const gateway = createGateway();
    const storage = new ReaderDocumentExtractionStorage(gateway, "document-pages");
    await storage.persistAttemptEnvelopes({
      userId: USER,
      updatedAt: "2026-10-12T12:00:00Z",
      envelopes: [sampleEnvelope("doc-ok", "SUCCEEDED")],
    });
    const mutated = sampleEnvelope("doc-ok", "SUCCEEDED");
    mutated.rawAssistantText = '{"documentTypeId":"iep.amendment"}';
    await expect(
      storage.persistAttemptEnvelopes({
        userId: USER,
        updatedAt: "2026-10-12T12:01:00Z",
        envelopes: [mutated],
      }),
    ).rejects.toThrow("READER_DOCUMENT_EXTRACTION_ATTEMPT_CONFLICT");
  });

  it("surfaces storage upload failures for legacy envelopes", async () => {
    const gateway = createGateway();
    gateway.uploadObject = vi.fn(async () => {
      throw new Error("STORAGE_UNAVAILABLE");
    });
    const storage = new ReaderDocumentExtractionStorage(gateway, "document-pages");
    await expect(
      storage.persistAttemptEnvelopes({
        userId: USER,
        updatedAt: "2026-10-12T12:00:00Z",
        envelopes: [sampleEnvelope("doc-ok", "SUCCEEDED")],
      }),
    ).rejects.toThrow("STORAGE_UNAVAILABLE");
  });
});

const miniPack: ProposalDomainPack = {
  schemaVersion: "hive.domain-pack.proposal/0.3.0",
  manifest: { id: "mini", version: "1.0.0" },
  readingNotes: { global: "", byDocumentType: {} },
  documentTypes: [{ id: "doc.simple", checklist: ["header_row"] }],
  recordTypes: [
    {
      id: "header_row",
      repeatable: false,
      fields: [{ id: "title", valueKind: "text", source: ["quoted"], modality: ["observed"] }],
    },
  ],
};

describe("PackDrivenReaderArtifactStorage", () => {
  it("persists eight document raw/validated artifacts and a complete manifest", async () => {
    const gateway = createGateway();
    const storage = new PackDrivenReaderArtifactStorage(gateway, "document-pages");
    const ids = Array.from({ length: 8 }, (_, index) => `doc-${index + 1}`);
    const envelopes = ids.map((sourceDocumentId) => ({
      schemaVersion: READER_DOCUMENT_EXTRACTION_SCHEMA_VERSION,
      studyRunId: STUDY,
      attemptId: ATTEMPT,
      caseId: CASE,
      userId: USER,
      sourceDocumentId,
      domainId: "iep",
      packId: "mini",
      packVersion: "1.0.0",
      packContentSha256: "a".repeat(64),
      promptVersion: PACK_DRIVEN_READER_PROMPT_VERSION,
      modelProvider: "fixture",
      modelId: "fixture",
      status: "SUCCEEDED" as const,
      occurredAt: "2026-01-01T00:00:00.000Z",
      parsedModelJson: {
        schemaVersion: PACK_DRIVEN_READER_EXTRACTION_SCHEMA_VERSION,
        packId: "mini",
        packVersion: "1.0.0",
        documentTypeId: "doc.simple",
        sourceDocumentId,
        checklistCoverage: [{ recordTypeId: "header_row", disposition: "not_found" }],
        recordInstances: [],
      },
    }));
    const logicalDocumentIdBySourceDocumentId = new Map(
      ids.map((sourceDocumentId, index) => [sourceDocumentId, `logical-${index + 1}`]),
    );
    const result = await storage.persistStudyReaderArtifacts({
      userId: USER,
      pack: miniPack,
      envelopes,
      perDocumentResults: ids.map((sourceDocumentId) => ({
        sourceDocumentId,
        parseOk: true,
        candidateFacts: [],
        acceptedCandidateFacts: [],
      })),
      logicalDocumentIdBySourceDocumentId,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.manifest.complete).toBe(true);
    expect(result.manifest.documents).toHaveLength(8);
    expect(result.studyManifestPath).toBe(packDrivenReaderStudyManifestArtifactPath(USER, STUDY));
    for (const doc of result.documentPaths) {
      expect(doc.rawPath).toBe(packDrivenReaderDocumentRawArtifactPath(USER, STUDY, doc.logicalDocumentId));
    }
  });

  it("rejects owner mismatch and conflicting artifact rewrites", async () => {
    const gateway = createGateway();
    const storage = new PackDrivenReaderArtifactStorage(gateway, "document-pages");
    const envelope = {
      schemaVersion: READER_DOCUMENT_EXTRACTION_SCHEMA_VERSION,
      studyRunId: STUDY,
      attemptId: ATTEMPT,
      caseId: CASE,
      userId: USER,
      sourceDocumentId: "doc-1",
      domainId: "iep",
      packId: "mini",
      packVersion: "1.0.0",
      packContentSha256: "a".repeat(64),
      promptVersion: PACK_DRIVEN_READER_PROMPT_VERSION,
      modelProvider: "fixture",
      modelId: "fixture",
      status: "SUCCEEDED" as const,
      occurredAt: "2026-01-01T00:00:00.000Z",
      parsedModelJson: {
        schemaVersion: PACK_DRIVEN_READER_EXTRACTION_SCHEMA_VERSION,
        packId: "mini",
        packVersion: "1.0.0",
        documentTypeId: "doc.simple",
        sourceDocumentId: "doc-1",
        checklistCoverage: [{ recordTypeId: "header_row", disposition: "not_found" }],
        recordInstances: [],
      },
    };
    const baseInput = {
      userId: USER,
      pack: miniPack,
      envelopes: [envelope],
      perDocumentResults: [{ sourceDocumentId: "doc-1", parseOk: true }],
      logicalDocumentIdBySourceDocumentId: new Map([["doc-1", "logical-1"]]),
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    await storage.persistStudyReaderArtifacts(baseInput);
    await expect(
      storage.persistStudyReaderArtifacts({ ...baseInput, userId: "other-user" }),
    ).rejects.toThrow(/OWNER_MISMATCH/);
    await expect(
      storage.persistStudyReaderArtifacts({
        ...baseInput,
        envelopes: [{ ...envelope, modelId: "other-model" }],
      }),
    ).rejects.toThrow(/ARTIFACT_CONFLICT/);
  });

  it("surfaces storage upload failures before manifest completion", async () => {
    const gateway = createGateway();
    gateway.uploadObject = vi.fn(async () => {
      throw new Error("STORAGE_UNAVAILABLE");
    });
    const storage = new PackDrivenReaderArtifactStorage(gateway, "document-pages");
    await expect(
      storage.persistStudyReaderArtifacts({
        userId: USER,
        pack: miniPack,
        envelopes: [
          {
            schemaVersion: READER_DOCUMENT_EXTRACTION_SCHEMA_VERSION,
            studyRunId: STUDY,
            attemptId: ATTEMPT,
            caseId: CASE,
            userId: USER,
            sourceDocumentId: "doc-1",
            domainId: "iep",
            packId: "mini",
            packVersion: "1.0.0",
            packContentSha256: "a".repeat(64),
            promptVersion: PACK_DRIVEN_READER_PROMPT_VERSION,
            modelProvider: "fixture",
            modelId: "fixture",
            status: "SUCCEEDED",
            occurredAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        perDocumentResults: [],
        logicalDocumentIdBySourceDocumentId: new Map([["doc-1", "logical-1"]]),
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).rejects.toThrow("STORAGE_UNAVAILABLE");
  });
});
