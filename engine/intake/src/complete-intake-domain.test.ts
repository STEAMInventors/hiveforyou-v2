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
    rawIntent: "Preparing for an IEP meeting",
    explicitDomainId: "iep",
    jevDomainProposal: null,
    jevDomainConfidence: null,
    resolvedDomainId: null,
    resolutionSource: null,
    studyPath: null,
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
    expect(result.packExecution?.logicalDocuments[0]?.customerLabel).toBe("Initial IEP");
  });

  it("infers IEP pack execution from classified documents without explicit domain", async () => {
    const result = await completeIntakeDomainPack({
      run: baseRun({ explicitDomainId: null, rawIntent: null }),
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
});
