import { NORMALIZED_EXTRACTION_SCHEMA_VERSION } from "@hiveforyou/shared/intake";
import { describe, expect, it, vi } from "vitest";

import { completeIntakeDomainPack } from "./complete-intake-domain";
import { ensureTestIepPackRegistered } from "./test-fixtures/register-test-iep-pack";
import type { DocumentIdentityRecord, IntakeRunRecord } from "./types";

ensureTestIepPackRegistered();

function baseRun(overrides: Partial<IntakeRunRecord> = {}): IntakeRunRecord {
  return {
    id: "run-1",
    userId: "user-1",
    caseId: "case-1",
    status: "SUCCEEDED",
    classifier: "LOCAL",
    classifierVersion: null,
    idempotencyKey: "key",
    startedAt: new Date().toISOString(),
    rawIntent: "Preparing for an IEP meeting",
    selectedDomainId: "iep",
    jevDomainProposal: null,
    jevDomainConfidence: null,
    resolvedDomainId: null,
    resolutionSource: null,
    studyPath: null,
    studyIntent: null,
    packExecutionJson: null,
    intakeQueueSeq: 0,
    completedAt: new Date().toISOString(),
    errorCode: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const identity: DocumentIdentityRecord = {
  id: "id-1",
  userId: "user-1",
  caseId: "case-1",
  intakeRunId: "run-1",
  sourceDocumentId: "doc-1",
  processingStatus: "CLASSIFIED",
  proposedType: "iep_document",
  confidence: 0.95,
  proposedBy: "JEV",
  classifierVersion: null,
  returnedModel: null,
  classifiedAt: new Date().toISOString(),
  errorCode: null,
  analysisDisposition: "PRESENT",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("completeIntakeDomainPack", () => {
  it("skips Jev domain routing when explicit domain is set", async () => {
    const decideDomain = vi.fn(async () => ({
      choice: "medicaid",
      confidence: 0.99,
      returnedModel: null,
      classifierVersion: null,
    }));

    const result = await completeIntakeDomainPack({
      run: baseRun(),
      identities: [identity],
      filenamesBySourceId: { "doc-1": "referral.pdf" },
      normalizedBySourceId: {
        "doc-1": {
          id: "norm-1",
          userId: "user-1",
          sourceDocumentId: "doc-1",
          sourceHash: "hash",
          schemaVersion: NORMALIZED_EXTRACTION_SCHEMA_VERSION,
          normalizedExtraction: {
            schemaVersion: NORMALIZED_EXTRACTION_SCHEMA_VERSION,
            extractorVersion: "nestiep-extractor/2",
            sourceDocumentId: "doc-1",
            sourceHash: "hash",
            mimeType: "application/pdf",
            detectedKind: "pdf",
            statistics: { pageCount: 1, nativePageCount: 1, ocrPageCount: 0 },
            sourceIssues: [],
            pages: [
              {
                runId: "run-1",
                sourceDocumentId: "doc-1",
                pageNumber: 1,
                extractionMethod: "NATIVE",
                canonicalText: "Individualized Education Program",
                lines: [],
                blocks: [],
                sourceIssues: [],
              },
            ],
          },
          createdAt: new Date().toISOString(),
        },
      },
      decideDomain,
    });

    expect(decideDomain).not.toHaveBeenCalled();
    expect(result.run.resolutionSource).toBe("EXPLICIT");
    expect(result.run.resolvedDomainId).toBe("iep");
    expect(result.run.studyIntent).toMatchObject({
      schemaVersion: "hive.study-intent/1",
      selectedDomainId: "iep",
      schemaSource: "pinned_pack",
      routingPath: "explicit",
      originalGoal: "Preparing for an IEP meeting",
      interpretedTask: null,
      clarificationStatus: "not_required",
    });
    expect(result.run.studyIntent?.resolvedSchemaId).toMatch(/^iep_v/);
    expect(result.packExecution?.logicalDocuments[0]?.customerLabel).toBe("Initial IEP");
  });

  it("infers IEP pack execution from classified documents without explicit domain", async () => {
    const result = await completeIntakeDomainPack({
      run: baseRun({ selectedDomainId: null, rawIntent: null }),
      identities: [identity],
      filenamesBySourceId: { "doc-1": "iep-2026.pdf" },
      normalizedBySourceId: {
        "doc-1": {
          id: "norm-1",
          userId: "user-1",
          sourceDocumentId: "doc-1",
          sourceHash: "hash",
          schemaVersion: NORMALIZED_EXTRACTION_SCHEMA_VERSION,
          normalizedExtraction: {
            schemaVersion: NORMALIZED_EXTRACTION_SCHEMA_VERSION,
            extractorVersion: "nestiep-extractor/2",
            sourceDocumentId: "doc-1",
            sourceHash: "hash",
            mimeType: "application/pdf",
            detectedKind: "pdf",
            statistics: { pageCount: 1, nativePageCount: 1, ocrPageCount: 0 },
            sourceIssues: [],
            pages: [
              {
                runId: "run-1",
                sourceDocumentId: "doc-1",
                pageNumber: 1,
                extractionMethod: "NATIVE",
                canonicalText: "Individualized Education Program annual goals",
                lines: [],
                blocks: [],
                sourceIssues: [],
              },
            ],
          },
          createdAt: new Date().toISOString(),
        },
      },
    });

    expect(result.run.resolvedDomainId).toBe("iep");
    expect(result.run.studyPath).toBe("DOMAIN_PACK");
    expect(result.packExecution?.logicalDocuments.some((doc) => doc.customerLabel.includes("IEP"))).toBe(
      true,
    );
  });

  it("builds ad-hoc StudyIntent with dynamic schema when domain is unresolved", async () => {
    const persistEphemeralSchema = vi.fn(async () => "ephemeral-schema-uuid-1");

    const result = await completeIntakeDomainPack({
      run: baseRun({
        selectedDomainId: null,
        rawIntent: "Track junk food spending from my receipts",
      }),
      identities: [
        {
          ...identity,
          proposedType: "other",
          confidence: 0.2,
        },
      ],
      filenamesBySourceId: { "doc-1": "receipt.pdf" },
      normalizedBySourceId: {
        "doc-1": {
          id: "norm-1",
          userId: "user-1",
          sourceDocumentId: "doc-1",
          sourceHash: "hash",
          schemaVersion: NORMALIZED_EXTRACTION_SCHEMA_VERSION,
          normalizedExtraction: {
            schemaVersion: NORMALIZED_EXTRACTION_SCHEMA_VERSION,
            extractorVersion: "nestiep-extractor/2",
            sourceDocumentId: "doc-1",
            sourceHash: "hash",
            mimeType: "application/pdf",
            detectedKind: "pdf",
            statistics: { pageCount: 1, nativePageCount: 1, ocrPageCount: 0 },
            sourceIssues: [],
            pages: [
              {
                runId: "run-1",
                sourceDocumentId: "doc-1",
                pageNumber: 1,
                extractionMethod: "NATIVE",
                canonicalText: "Store receipt total 12.50 chips soda",
                lines: [],
                blocks: [],
                sourceIssues: [],
              },
            ],
          },
          createdAt: new Date().toISOString(),
        },
      },
      decideDomain: vi.fn(async () => ({
        choice: "NO_MATCH",
        confidence: 0.1,
        returnedModel: null,
        classifierVersion: null,
      })),
      persistEphemeralSchema,
    });

    expect(result.run.studyPath).toBe("GENERIC_STUDY");
    expect(result.run.studyIntent).toMatchObject({
      schemaVersion: "hive.study-intent/1",
      selectedDomainId: null,
      resolvedSchemaId: "ephemeral-schema-uuid-1",
      schemaSource: "dynamic_generation",
      routingPath: "ad-hoc",
      originalGoal: "Track junk food spending from my receipts",
      clarificationStatus: "not_required",
      interpretedTask: {
        operation: "filter_and_sum",
        target_array: "items",
        filter_condition: "junk_food_flag == true",
      },
    });
    expect(persistEphemeralSchema).toHaveBeenCalledOnce();
  });
});
