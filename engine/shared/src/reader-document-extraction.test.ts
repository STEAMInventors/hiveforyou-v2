import { describe, expect, it } from "vitest";

import {
  buildReaderDocumentExtractionEnvelope,
  parseReaderDocumentExtractionEnvelope,
  READER_DOCUMENT_EXTRACTION_SCHEMA_VERSION,
} from "./reader-document-extraction.js";

describe("hive.reader-document-extraction/1", () => {
  it("validates envelope correlation fields", () => {
    const envelope = buildReaderDocumentExtractionEnvelope({
      schemaVersion: READER_DOCUMENT_EXTRACTION_SCHEMA_VERSION,
      studyRunId: "study-1",
      attemptId: "attempt-1",
      caseId: "case-1",
      userId: "user-1",
      sourceDocumentId: "doc-1",
      domainId: "iep",
      packId: "iep",
      packVersion: "0.3.0-proposed",
      packContentSha256: "a".repeat(64),
      promptVersion: "hive-pack-driven-reader/0.2.0",
      modelProvider: "anthropic",
      modelId: "claude-test",
      status: "SUCCEEDED",
      occurredAt: "2026-10-12T12:00:00Z",
      rawAssistantText: '{"documentTypeId":"iep.plan"}',
      parsedModelJson: { documentTypeId: "iep.plan" },
    });
    expect(parseReaderDocumentExtractionEnvelope(envelope).status).toBe("SUCCEEDED");
  });
});
