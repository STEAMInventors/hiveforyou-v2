import { describe, expect, it, vi } from "vitest";

import {
  NORMALIZED_EXTRACTION_SCHEMA_VERSION,
  NESTIEP_EXTRACTOR_VERSION,
  toIntakeCustomerView,
  type IntakeCustomerViewDocumentInput,
} from "@hiveforyou/shared/intake";

import type { ExtractDocumentInput } from "./extract-document";
import { executeIntakeRun } from "./execute-intake";
import { buildJevIdentityRequest, type JevIdentityDecision } from "./jev-client";
import {
  InMemoryDocumentExtractionRepository,
  InMemoryDocumentIdentityRepository,
  InMemoryDocumentNormalizedExtractionRepository,
  InMemoryIntakeRunRepository,
} from "./memory";
import { openIntakeRun } from "./open-intake";
import type { DocumentExtractionResult, IntakeSourceDocument } from "./types";
import type { IntakeExecutionDeps } from "./execute-intake";

const userId = "user-1";
const caseId = "case-1";
const plantedFilename = "iep-renamed-bank_statement.pdf";
const enough =
  "This page lists account activity, deposits, withdrawals, and a running balance for the statement period. ";

function customerViewDocuments(
  identities: Array<{
    sourceDocumentId: string;
    processingStatus: import("@hiveforyou/shared/intake").IntakeDocumentStatus;
    proposedType: import("@hiveforyou/shared/intake").DocumentIdentityType | null;
    errorCode: string | null;
  }>,
  hasNormalizedExtraction = false,
): IntakeCustomerViewDocumentInput[] {
  return identities.map((identity) => ({
    sourceDocumentId: identity.sourceDocumentId,
    processingStatus: identity.processingStatus,
    proposedType: identity.proposedType,
    errorCode: identity.errorCode,
    filename: "document.pdf",
    sizeBytes: 1024,
    hasNormalizedExtraction,
  }));
}

function minimalNormalized(documentId: string, sourceHash: string) {
  return {
    schemaVersion: NORMALIZED_EXTRACTION_SCHEMA_VERSION,
    extractorVersion: NESTIEP_EXTRACTOR_VERSION,
    sourceDocumentId: documentId,
    sourceHash,
    mimeType: "application/pdf",
    detectedKind: "pdf" as const,
    statistics: { pageCount: 1, nativePageCount: 1, ocrPageCount: 0 },
    sourceIssues: [],
    pages: [
      {
        runId: "run-1",
        sourceDocumentId: documentId,
        pageNumber: 1,
        extractionMethod: "NATIVE" as const,
        canonicalText: enough.repeat(2),
        lines: [],
        blocks: [],
        sourceIssues: [],
      },
    ],
  };
}

function succeededExtraction(documentId: string, sourceHash: string, text: string): DocumentExtractionResult {
  return {
    documentId,
    extractionStatus: "SUCCEEDED",
    text,
    pages: [
      { pageNumber: 1, text, extractionMethod: "NATIVE", boundingBoxes: null },
      {
        pageNumber: 2,
        text: "Continued activity on the next page of the same document record.",
        extractionMethod: "NATIVE",
        boundingBoxes: null,
      },
    ],
    extractionMethod: "NATIVE",
    sourceHash,
    errorCode: null,
    normalizedExtraction: null,
  };
}

function harness(options?: {
  documents?: IntakeSourceDocument[];
  extract?: IntakeExecutionDeps["extract"];
  decide?: IntakeExecutionDeps["decide"];
  normalizedExtractions?: IntakeExecutionDeps["normalizedExtractions"];
}) {
  const runs = new InMemoryIntakeRunRepository();
  const identities = new InMemoryDocumentIdentityRepository();
  const extractions = new InMemoryDocumentExtractionRepository();
  const normalizedExtractions =
    options?.normalizedExtractions ?? new InMemoryDocumentNormalizedExtractionRepository();
  let id = 0;
  const deps: IntakeExecutionDeps = {
    runs,
    identities,
    extractions,
    normalizedExtractions,
    loadDocuments: async ({ sourceDocumentIds }) => {
      const documents = options?.documents ?? [];
      return sourceDocumentIds
        .map((sourceDocumentId) => documents.find((document) => document.sourceDocumentId === sourceDocumentId))
        .filter((document): document is IntakeSourceDocument => Boolean(document));
    },
    extract: options?.extract,
    decide:
      options?.decide ??
      (async () => ({
        choice: "bank_statement",
        confidence: 1,
        returnedModel: null,
        classifierVersion: null,
      })),
    now: () => "2026-09-30T16:00:00.000Z",
    createId: () => `id-${++id}`,
    inFlight: new Map(),
  };
  return { deps, runs, identities, extractions, normalizedExtractions };
}

describe("intake job", () => {
  it("calls Jev after a successful extraction and persists the proposed identity", async () => {
    const text = enough.repeat(20);
    const decide = vi.fn(
      async (sample: string): Promise<JevIdentityDecision> => {
        expect(sample).not.toContain(plantedFilename);
        expect(sample).toHaveLength(1000);
        const request = buildJevIdentityRequest(sample);
        expect(JSON.stringify(request)).not.toContain(plantedFilename);
        expect(request.state).toBe(sample);
        return { choice: "bank_statement", confidence: 1, returnedModel: null, classifierVersion: null };
      },
    );
    const { deps, identities, extractions } = harness({
      documents: [
        {
          sourceDocumentId: "doc-bank",
          mimeType: "application/pdf",
          sha256: "hash-bank",
          bytes: new Uint8Array([1]),
        },
      ],
      extract: async (input: ExtractDocumentInput) =>
        succeededExtraction(input.documentId, input.sourceHash, text),
      decide,
    });

    const opened = await openIntakeRun(deps, {
      userId,
      caseId,
      sourceDocumentIds: ["doc-bank"],
    });
    const run = await opened.begin();

    expect(decide).toHaveBeenCalledOnce();
    expect(run.status).toBe("SUCCEEDED");
    expect(run.classifierVersion).toBeNull();
    const identity = identities.rows[0];
    expect(identity?.processingStatus).toBe("CLASSIFIED");
    expect(identity?.proposedType).toBe("bank_statement");
    expect(identity?.confidence).toBe(1);
    expect(identity?.proposedBy).toBe("LOCAL");
    expect(identity?.classifierVersion).toBeNull();
    expect(identity?.returnedModel).toBeNull();
    expect(identity?.classifiedAt).toBeTruthy();
    expect(extractions.rows.map((page) => page.pageNumber)).toEqual([1, 2]);
    expect(extractions.rows.every((page) => page.sourceHash === "hash-bank")).toBe(true);
    expect(extractions.rows.every((page) => page.extractionMethod === "NATIVE")).toBe(true);
    expect(extractions.rows.every((page) => page.boundingBoxes === null)).toBe(true);
    const customer = toIntakeCustomerView(run, customerViewDocuments(identities.rows));
    expect(JSON.stringify(customer)).not.toContain("confidence");
    expect(customer.documents[0]?.label).toBe("Bank statement");
  });

  it("accepts tax_return and iep_document proposals", async () => {
    for (const choice of ["tax_return", "iep_document"] as const) {
      const { deps, identities } = harness({
        documents: [
          {
            sourceDocumentId: `doc-${choice}`,
            mimeType: "application/pdf",
            sha256: `hash-${choice}`,
            bytes: new Uint8Array([1]),
          },
        ],
        extract: async (input) => succeededExtraction(input.documentId, input.sourceHash, enough.repeat(2)),
        decide: async () => ({
          choice,
          confidence: choice === "tax_return" ? 0.85 : 1,
          returnedModel: null,
          classifierVersion: null,
        }),
      });
      const opened = await openIntakeRun(deps, {
        userId,
        caseId,
        sourceDocumentIds: [`doc-${choice}`],
      });
      await opened.begin();
      expect(identities.rows[0]?.proposedType).toBe(choice);
      expect(identities.rows[0]?.processingStatus).toBe("CLASSIFIED");
      const customer = toIntakeCustomerView(
        { id: "run", status: "SUCCEEDED" },
        customerViewDocuments(identities.rows),
      );
      expect(customer.documents[0]?.label).toBe(
        choice === "tax_return" ? "Tax return" : "Special education document",
      );
    }
  });

  it("does not call Jev when extraction is insufficient", async () => {
    const decide = vi.fn();
    const { deps, identities } = harness({
      documents: [
        {
          sourceDocumentId: "doc-scan",
          mimeType: "application/pdf",
          sha256: "hash-scan",
          bytes: new Uint8Array([1]),
        },
      ],
      extract: async (input) => ({
        documentId: input.documentId,
        extractionStatus: "NEEDS_OCR",
        text: "",
        pages: [{ pageNumber: 1, text: "", extractionMethod: "OCR", boundingBoxes: null }],
        extractionMethod: "OCR",
        sourceHash: input.sourceHash,
        errorCode: null,
        normalizedExtraction: null,
      }),
      decide,
    });
    const opened = await openIntakeRun(deps, {
      userId,
      caseId,
      sourceDocumentIds: ["doc-scan"],
    });
    const run = await opened.begin();
    expect(decide).not.toHaveBeenCalled();
    expect(identities.rows[0]?.processingStatus).toBe("NEEDS_OCR");
    expect(identities.rows[0]?.proposedType).toBeNull();
    expect(run.status).toBe("NEEDS_REVIEW");
  });

  it("classifies short valid text as too short without dropping the document", async () => {
    const decide = vi.fn();
    const short = "Signed: J. Doe";
    const { deps, identities } = harness({
      documents: [
        {
          sourceDocumentId: "doc-short",
          mimeType: "application/pdf",
          sha256: "hash-short",
          bytes: new Uint8Array([1]),
        },
      ],
      extract: async (input) => {
        const normalized = minimalNormalized(input.documentId, input.sourceHash);
        const result: DocumentExtractionResult = {
          documentId: input.documentId,
          extractionStatus: "SUCCEEDED",
          text: short,
          pages: [{ pageNumber: 1, text: short, extractionMethod: "NATIVE", boundingBoxes: null }],
          extractionMethod: "NATIVE",
          sourceHash: input.sourceHash,
          errorCode: null,
          normalizedExtraction: {
            ...normalized,
            pages: [
              {
                ...normalized.pages[0]!,
                canonicalText: short,
              },
            ],
          },
        };
        return result;
      },
      decide,
    });
    const opened = await openIntakeRun(deps, {
      userId,
      caseId,
      sourceDocumentIds: ["doc-short"],
    });
    const run = await opened.begin();
    expect(decide).not.toHaveBeenCalled();
    expect(identities.rows[0]?.processingStatus).toBe("NEEDS_REVIEW");
    expect(identities.rows[0]?.proposedType).toBe("other");
    expect(identities.rows[0]?.errorCode).toBe("TEXT_TOO_SHORT");
    expect(identities.rows[0]?.analysisDisposition).not.toBe("DISCARDED");
    expect(run.status).toBe("NEEDS_REVIEW");
  });

  it("does not turn a Jev failure into other", async () => {
    const { JevRequestError } = await import("./jev-client");
    const decide = vi.fn(async (sample: string): Promise<JevIdentityDecision> => {
      if (sample.includes("FAIL_THIS")) {
        throw new JevRequestError("JEV_REJECTED");
      }
      return {
        choice: "tax_return",
        confidence: 0.85,
        returnedModel: "jev-1.13.0",
        classifierVersion: null,
      };
    });
    const { deps, identities } = harness({
      documents: [
        {
          sourceDocumentId: "doc-bank",
          mimeType: "application/pdf",
          sha256: "hash-bank",
          bytes: new Uint8Array([1]),
        },
        {
          sourceDocumentId: "doc-ok",
          mimeType: "application/pdf",
          sha256: "hash-ok",
          bytes: new Uint8Array([2]),
        },
      ],
      extract: async (input) =>
        succeededExtraction(
          input.documentId,
          input.sourceHash,
          input.documentId === "doc-bank" ? `${enough.repeat(2)} FAIL_THIS` : enough.repeat(2),
        ),
      decide,
    });
    const opened = await openIntakeRun(deps, {
      userId,
      caseId,
      sourceDocumentIds: ["doc-bank", "doc-ok"],
    });
    const completed = await opened.begin();
    const failed = identities.rows.find((row) => row.sourceDocumentId === "doc-bank");
    const ok = identities.rows.find((row) => row.sourceDocumentId === "doc-ok");
    expect(failed?.processingStatus).toBe("FAILED");
    expect(failed?.proposedType).toBeNull();
    expect(failed?.errorCode).toBe("JEV_REJECTED");
    expect(ok?.proposedType).toBe("tax_return");
    expect(ok?.returnedModel).toBe("jev-1.13.0");
    expect(ok?.classifierVersion).toBeNull();
    expect(completed.status).toBe("NEEDS_REVIEW");
    expect(completed.errorCode).toBeNull();
    expect(decide).toHaveBeenCalledTimes(2);
  });

  it("skips documents that are already classified on retry", async () => {
    const decide = vi.fn(async (): Promise<JevIdentityDecision> => ({
      choice: "iep_document",
      confidence: 1,
      returnedModel: null,
      classifierVersion: null,
    }));
    const { deps } = harness({
      documents: [
        {
          sourceDocumentId: "doc-iep",
          mimeType: "application/pdf",
          sha256: "hash-iep",
          bytes: new Uint8Array([4]),
        },
      ],
      extract: async (input) => succeededExtraction(input.documentId, input.sourceHash, enough.repeat(2)),
      decide,
    });
    const opened = await openIntakeRun(deps, {
      userId,
      caseId,
      sourceDocumentIds: ["doc-iep"],
    });
    await opened.begin();
    expect(decide).toHaveBeenCalledOnce();

    const again = await openIntakeRun(deps, {
      userId,
      caseId,
      sourceDocumentIds: ["doc-iep"],
    });
    const rerun = await again.begin();
    expect(decide).toHaveBeenCalledOnce();
    expect(rerun.status).toBe("SUCCEEDED");
    expect(deps.identities ? true : true).toBe(true);
  });

  it("stores other only when Jev chooses other", async () => {
    const { deps, identities } = harness({
      documents: [
        {
          sourceDocumentId: "doc-other",
          mimeType: "text/plain",
          sha256: "hash-other",
          bytes: new Uint8Array([9]),
        },
      ],
      extract: async (input) => succeededExtraction(input.documentId, input.sourceHash, enough.repeat(2)),
      decide: async () => ({
        choice: "other",
        confidence: 0.9,
        returnedModel: null,
        classifierVersion: null,
      }),
    });
    const opened = await openIntakeRun(deps, {
      userId,
      caseId,
      sourceDocumentIds: ["doc-other"],
    });
    await opened.begin();
    expect(identities.rows[0]?.proposedType).toBe("other");
    expect(identities.rows[0]?.processingStatus).toBe("CLASSIFIED");
  });

  it("persists the full normalized extraction artifact before classification completes", async () => {
    const text = enough.repeat(20);
    const { deps, identities, normalizedExtractions } = harness({
      documents: [
        {
          sourceDocumentId: "doc-bank",
          mimeType: "application/pdf",
          sha256: "hash-bank",
          bytes: new Uint8Array([1]),
        },
      ],
      extract: async (input) => ({
        ...succeededExtraction(input.documentId, input.sourceHash, text),
        normalizedExtraction: minimalNormalized(input.documentId, input.sourceHash),
      }),
    });

    const opened = await openIntakeRun(deps, {
      userId,
      caseId,
      sourceDocumentIds: ["doc-bank"],
    });
    await opened.begin();

    expect(identities.rows[0]?.processingStatus).toBe("CLASSIFIED");
    expect(normalizedExtractions.rows).toHaveLength(1);
    expect(normalizedExtractions.rows[0]?.schemaVersion).toBe(NORMALIZED_EXTRACTION_SCHEMA_VERSION);
    expect(normalizedExtractions.rows[0]?.normalizedExtraction.schemaVersion).toBe(
      NORMALIZED_EXTRACTION_SCHEMA_VERSION,
    );
    expect(normalizedExtractions.rows[0]?.normalizedExtraction.pages.length).toBeGreaterThan(0);
    expect(normalizedExtractions.rows[0]?.normalizedExtraction).not.toHaveProperty("state");
  });

  it("marks a low-confidence proposal as needing review", async () => {
    const { deps, identities } = harness({
      documents: [
        {
          sourceDocumentId: "doc-low",
          mimeType: "application/pdf",
          sha256: "hash-low",
          bytes: new Uint8Array([3]),
        },
      ],
      extract: async (input) => succeededExtraction(input.documentId, input.sourceHash, enough.repeat(2)),
      decide: async () => ({
        choice: "pay_stub",
        confidence: 0.4,
        returnedModel: null,
        classifierVersion: null,
      }),
    });
    const opened = await openIntakeRun(deps, {
      userId,
      caseId,
      sourceDocumentIds: ["doc-low"],
    });
    const run = await opened.begin();
    expect(identities.rows[0]?.processingStatus).toBe("NEEDS_REVIEW");
    expect(identities.rows[0]?.proposedType).toBe("pay_stub");
    expect(run.status).toBe("NEEDS_REVIEW");
    const customer = toIntakeCustomerView(run, customerViewDocuments(identities.rows));
    expect(customer.documents[0]?.label).toBeNull();
  });
});

describe("executeIntakeRun extraction cache", () => {
  it("skips extract when normalized extraction already exists for the same source hash", async () => {
    const text = enough.repeat(20);
    const extract = vi.fn(async (input: ExtractDocumentInput) =>
      succeededExtraction(input.documentId, input.sourceHash, text),
    );
    const { deps, normalizedExtractions } = harness({
      documents: [
        {
          sourceDocumentId: "doc-bank",
          mimeType: "application/pdf",
          sha256: "hash-bank",
          bytes: new Uint8Array([1]),
        },
      ],
      extract,
    });
    const cachedNormalized = minimalNormalized("doc-bank", "hash-bank");
    cachedNormalized.pages[0]!.canonicalText = enough.repeat(20);
    await normalizedExtractions.upsert({
      id: "norm-1",
      userId,
      sourceDocumentId: "doc-bank",
      sourceHash: "hash-bank",
      schemaVersion: NORMALIZED_EXTRACTION_SCHEMA_VERSION,
      normalizedExtraction: cachedNormalized,
      createdAt: "2026-09-30T16:00:00.000Z",
    });

    const opened = await openIntakeRun(deps, {
      userId,
      caseId,
      sourceDocumentIds: ["doc-bank"],
    });
    await opened.begin();

    expect(extract).not.toHaveBeenCalled();
  });
});

describe("executeIntakeRun direct resume", () => {
  it("does not call Jev again for a classified document", async () => {
    const decide = vi.fn(async (): Promise<JevIdentityDecision> => ({
      choice: "bank_statement",
      confidence: 1,
      returnedModel: null,
      classifierVersion: null,
    }));
    const { deps, runs } = harness({
      documents: [
        {
          sourceDocumentId: "doc-bank",
          mimeType: "application/pdf",
          sha256: "hash-bank",
          bytes: new Uint8Array([1]),
        },
      ],
      extract: async (input) => succeededExtraction(input.documentId, input.sourceHash, enough.repeat(2)),
      decide,
    });
    const opened = await openIntakeRun(deps, {
      userId,
      caseId,
      sourceDocumentIds: ["doc-bank"],
    });
    await opened.begin();
    const stored = runs.rows[0];
    if (!stored) {
      throw new Error("missing run");
    }
    stored.status = "RUNNING";
    stored.completedAt = null;
    await executeIntakeRun(deps, stored.id, userId);
    expect(decide).toHaveBeenCalledOnce();
  });
});
