import { describe, expect, it } from "vitest";

import {
  READER_DOCUMENT_EXTRACTION_SCHEMA_VERSION,
  type ReaderDocumentExtractionEnvelope,
} from "@hiveforyou/shared/reader-document-extraction";

import {
  assertReaderDocumentExtractionEnvelopeObjectKey,
  buildRawExtractionInspectorBundle,
  extractInspectorRecordsFromParsedModel,
  orderSourceDocumentIdsForEngine1,
} from "./raw-extraction-inspector.js";

describe("raw-extraction-inspector", () => {
  it("orders logical documents by Engine 1 sequenceOrder", () => {
    const ordered = orderSourceDocumentIdsForEngine1({
      logicalDocuments: [
        {
          id: "ld-b",
          domainId: "iep",
          sourceDocumentId: "src-b",
          pageStart: 1,
          pageEnd: 1,
          documentType: "iep",
          title: "B",
          groupId: "g",
          recognitionStatus: "recognized",
          sequenceOrder: 2,
          familyRole: "supporting",
          provenance: "UPLOADED_EVIDENCE",
        },
        {
          id: "ld-a",
          domainId: "iep",
          sourceDocumentId: "src-a",
          pageStart: 1,
          pageEnd: 1,
          documentType: "iep",
          title: "A",
          groupId: "g",
          recognitionStatus: "recognized",
          sequenceOrder: 1,
          familyRole: "supporting",
          provenance: "UPLOADED_EVIDENCE",
        },
      ],
      fallbackSourceDocumentIds: ["src-c"],
    });
    expect(ordered).toEqual(["src-a", "src-b", "src-c"]);
  });

  it("extracts records and evidence from parsed model JSON", () => {
    const { records, evidenceRefs } = extractInspectorRecordsFromParsedModel({
      documentTypeId: "iep.plan",
      recordInstances: [
        {
          recordTypeId: "goal",
          fields: {
            goalText: {
              value: "Read fluently",
              evidence: { sourceDocumentId: "doc-a", page: 1, quote: "Read fluently" },
            },
          },
        },
      ],
    });
    expect(records).toHaveLength(1);
    expect(records[0]?.recordTypeId).toBe("goal");
    expect(evidenceRefs[0]?.quote).toBe("Read fluently");
  });

  it("renders partial failures without hiding successful siblings", () => {
    const envelopeOk: ReaderDocumentExtractionEnvelope = {
      schemaVersion: READER_DOCUMENT_EXTRACTION_SCHEMA_VERSION,
      studyRunId: "study-1",
      attemptId: "attempt-1",
      caseId: "case-1",
      userId: "user-1",
      sourceDocumentId: "doc-ok",
      domainId: "iep",
      packId: "iep",
      packVersion: "0.3.0",
      packContentSha256: "a".repeat(64),
      promptVersion: "hive-pack-driven-reader/0.2.0",
      modelProvider: "anthropic",
      modelId: "claude-test",
      status: "SUCCEEDED" as const,
      occurredAt: "2026-10-12T12:00:00Z",
      parsedModelJson: { documentTypeId: "iep.plan" },
      latencyMs: 100,
    };
    const envelopeBad = {
      ...envelopeOk,
      sourceDocumentId: "doc-bad",
      status: "INVALID_JSON" as const,
      parsedModelJson: undefined,
      rawAssistantText: "not-json",
    };
    const bundle = buildRawExtractionInspectorBundle({
      caseId: "case-1",
      studyRunId: "study-1",
      studyRunStatus: "FAILED",
      attemptId: "attempt-1",
      terminalArtifact: {
        schemaVersion: "study-raw-extraction/1",
        studyRunId: "study-1",
        caseId: "case-1",
        attemptId: "attempt-1",
        outcome: "partial_failure",
        succeededDocumentIds: ["doc-ok"],
        failedDocumentIds: ["doc-bad"],
        audit: { persisted: true, status: "ok" },
        acceptedVerifierFactCount: 0,
        createdAt: "2026-10-12T12:00:00Z",
      },
      studyRunManifest: null,
      attemptManifest: {
        schemaVersion: "hive.reader-document-extraction-manifest/1",
        studyRunId: "study-1",
        attemptId: "attempt-1",
        caseId: "case-1",
        updatedAt: "2026-10-12T12:00:00Z",
        documents: [
          { sourceDocumentId: "doc-ok", status: "SUCCEEDED", envelopeObjectKey: "k1" },
          { sourceDocumentId: "doc-bad", status: "INVALID_JSON", envelopeObjectKey: "k2" },
        ],
      },
      envelopesBySourceDocumentId: new Map<string, ReaderDocumentExtractionEnvelope>([
        ["doc-ok", envelopeOk],
        ["doc-bad", envelopeBad],
      ]),
      orderedSourceDocumentIds: ["doc-ok", "doc-bad", "doc-missing"],
      logicalDocuments: [],
    });

    expect(bundle.rawExtractionOutcome).toBe("partial_failure");
    expect(bundle.documents.map((doc) => doc.displayStatus)).toEqual([
      "SUCCEEDED",
      "INVALID_JSON",
      "MISSING_OUTPUT",
    ]);
    expect(bundle.documents[0]?.envelope?.parsedModelJson).toEqual({ documentTypeId: "iep.plan" });
    expect(bundle.documents[1]?.envelope?.rawAssistantText).toBe("not-json");
  });

  it("uses terminal observed summary for inspector model identity", () => {
    const envelope: ReaderDocumentExtractionEnvelope = {
      schemaVersion: READER_DOCUMENT_EXTRACTION_SCHEMA_VERSION,
      studyRunId: "study-1",
      attemptId: "attempt-1",
      caseId: "case-1",
      userId: "user-1",
      sourceDocumentId: "doc-a",
      domainId: "iep",
      packId: "iep",
      packVersion: "0.3.0",
      packContentSha256: "a".repeat(64),
      promptVersion: "hive-pack-driven-reader/0.2.0",
      modelProvider: "anthropic",
      modelId: "claude-from-envelope",
      status: "SUCCEEDED",
      occurredAt: "2026-10-12T12:00:00Z",
    };
    const bundle = buildRawExtractionInspectorBundle({
      caseId: "case-1",
      studyRunId: "study-1",
      studyRunStatus: "SUCCEEDED",
      attemptId: "attempt-1",
      terminalArtifact: {
        schemaVersion: "study-raw-extraction/1",
        studyRunId: "study-1",
        caseId: "case-1",
        attemptId: "attempt-1",
        outcome: "succeeded",
        succeededDocumentIds: ["doc-a"],
        failedDocumentIds: [],
        audit: { persisted: true, status: "ok" },
        acceptedVerifierFactCount: 0,
        observedReaderIdentity: {
          attemptId: "attempt-1",
          distinctModelProviders: ["anthropic"],
          distinctModelIds: ["claude-from-summary"],
          documentCount: 1,
          succeededDocumentCount: 1,
          failedDocumentCount: 0,
          source: "hive.reader-document-extraction/1",
        },
        createdAt: "2026-10-12T12:00:00Z",
      },
      studyRunManifest: null,
      attemptManifest: null,
      envelopesBySourceDocumentId: new Map([["doc-a", envelope]]),
      orderedSourceDocumentIds: ["doc-a"],
      logicalDocuments: [],
    });
    expect(bundle.modelProvider).toBe("anthropic");
    expect(bundle.modelId).toBe("claude-from-summary");
  });

  it("rejects envelope object keys outside the owner prefix", () => {
    expect(() =>
      assertReaderDocumentExtractionEnvelopeObjectKey({
        userId: "user-1",
        studyRunId: "study-1",
        attemptId: "attempt-1",
        sourceDocumentId: "doc-a",
        objectKey: "other-user/reader-document-extractions/study-1/attempt-1/doc-a.json",
      }),
    ).toThrow("READER_DOCUMENT_EXTRACTION_FORBIDDEN_OBJECT_KEY");
  });
});
