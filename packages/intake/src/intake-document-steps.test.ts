import { describe, expect, it, vi } from "vitest";

import { runIntakeExtractStep } from "./intake-document-steps";
import {
  InMemoryDocumentExtractionRepository,
  InMemoryDocumentIdentityRepository,
  InMemoryDocumentNormalizedExtractionRepository,
  InMemoryIntakeRunRepository,
} from "./memory";
import type { IntakeExecutionDeps } from "./execute-intake";
import type { DocumentIdentityRecord, IntakeRunRecord, IntakeSourceDocument } from "./types";

const userId = "user-1";
const caseId = "case-1";
const runId = "run-1";
const sourceDocumentId = "doc-1";

function baseRun(): IntakeRunRecord {
  const now = "2026-10-04T12:00:00.000Z";
  return {
    id: runId,
    userId,
    caseId,
    idempotencyKey: "key",
    status: "RUNNING",
    classifier: "LOCAL",
    classifierVersion: null,
    startedAt: now,
    completedAt: null,
    errorCode: null,
    rawIntent: null,
    explicitDomainId: null,
    jevDomainProposal: null,
    jevDomainConfidence: null,
    resolvedDomainId: null,
    resolutionSource: null,
    studyPath: null,
    packExecutionJson: null,
    intakeQueueSeq: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function identity(): DocumentIdentityRecord {
  const now = "2026-10-04T12:00:00.000Z";
  return {
    id: "identity-1",
    intakeRunId: runId,
    sourceDocumentId,
    userId,
    caseId,
    processingStatus: "UPLOADED",
    proposedType: null,
    confidence: null,
    proposedBy: null,
    classifierVersion: null,
    returnedModel: null,
    classifiedAt: null,
    errorCode: null,
    analysisDisposition: "PRESENT",
    createdAt: now,
    updatedAt: now,
  };
}

function source(): IntakeSourceDocument {
  return {
    sourceDocumentId,
    mimeType: "application/pdf",
    sha256: "hash-1",
    bytes: new Uint8Array([1, 2, 3]),
  };
}

describe("runIntakeExtractStep", () => {
  it("skips re-extract when the identity is already terminal", async () => {
    const runs = new InMemoryIntakeRunRepository();
    const identities = new InMemoryDocumentIdentityRepository();
    const extractions = new InMemoryDocumentExtractionRepository();
    const normalized = new InMemoryDocumentNormalizedExtractionRepository();
    await runs.insert(baseRun());
    const done = identity();
    done.processingStatus = "CLASSIFIED";
    await identities.insert(done);

    const extract = vi.fn();
    const deps: IntakeExecutionDeps = {
      runs,
      identities,
      extractions,
      normalizedExtractions: normalized,
      loadDocuments: async () => [source()],
      decide: async () => ({
        choice: "other",
        confidence: 1,
        returnedModel: null,
        classifierVersion: null,
      }),
      extract,
    };

    const result = await runIntakeExtractStep(deps, baseRun(), sourceDocumentId, source());
    expect(result.extractionStatus).toBe("CLASSIFIED");
    expect(extract).not.toHaveBeenCalled();
  });
});
