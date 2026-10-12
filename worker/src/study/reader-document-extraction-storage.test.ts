import { describe, expect, it, vi } from "vitest";

import { READER_DOCUMENT_EXTRACTION_SCHEMA_VERSION } from "@hiveforyou/shared/reader-document-extraction";

import { ReaderDocumentExtractionStorage } from "./reader-document-extraction-storage.js";
import type { HiveGateway } from "../persistence/hive-gateway.js";

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

  it("surfaces storage upload failures", async () => {
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
