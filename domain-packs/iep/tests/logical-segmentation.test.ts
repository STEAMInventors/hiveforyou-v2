import { describe, expect, it } from "vitest";

import type { NormalizedDocumentExtraction } from "@hiveforyou/shared/intake";
import { NORMALIZED_EXTRACTION_SCHEMA_VERSION } from "@hiveforyou/shared/intake";

import { iepScanDocumentFromNormalized } from "../adapters/from-normalized-extraction";
import { classifyIepDocumentLocally } from "../document-interpreter/classify-local";
import type { IepLogicalDocumentBoundary } from "../document-interpreter/logical-segmentation";
import {
  applyLogicalSegmentation,
  identityBoundaries,
  packetSegmentationNeeded,
  segmentIepScanDocuments,
  validateLogicalBoundaries,
} from "../document-interpreter/logical-segmentation";
import type { IepScanDocument } from "../document-interpreter/contracts";
import { executeIepIntakePack } from "../execute-intake";

function pdfDoc(id: string, pages: string[], extras?: Partial<IepScanDocument>): IepScanDocument {
  return {
    scanDocumentId: id,
    originalDisplayName: `${id}.pdf`,
    mimeType: "application/pdf",
    pageCount: pages.length,
    pages: pages.map((text, index) => ({ pageNumber: index + 1, text })),
    readStatus: "ok",
    sourceUploadId: id,
    ...extras,
  };
}

function normalizedFromPages(sourceDocumentId: string, pages: string[]): NormalizedDocumentExtraction {
  return {
    schemaVersion: NORMALIZED_EXTRACTION_SCHEMA_VERSION,
    sourceDocumentId,
    sourceHash: "fixture-hash",
    mimeType: "application/pdf",
    detectedKind: "pdf",
    statistics: { pageCount: pages.length, nativePageCount: pages.length, ocrPageCount: 0 },
    sourceIssues: [],
    pages: pages.map((canonicalText, index) => ({
      runId: "fixture-run",
      sourceDocumentId,
      pageNumber: index + 1,
      extractionMethod: "NATIVE" as const,
      canonicalText,
      lines: [],
      blocks: [],
      sourceIssues: [],
    })),
  };
}

const QUALIFICATION_PACKET_PAGES = [
  "Referral for special education evaluation.",
  "Referral continued.",
  "Evaluation plan and consent to evaluate.",
  "Evaluation plan page 2.",
  "Psychoeducational evaluation report. Assessment results.",
  "Evaluation report continued.",
  "Evaluation report page 3.",
  "Individualized education program. Present levels. Annual goals. IEP team.",
  "IEP services page.",
  "IEP accommodations.",
  "IEP goals continued.",
  "IEP signature page.",
];

describe("IEP logical segmentation (NestIEP port)", () => {
  it("keeps a normal upload as one logical document", () => {
    const document = pdfDoc("upload", ["Individualized Education Program. Present levels."]);
    const slices = applyLogicalSegmentation(document, identityBoundaries(document));
    expect(slices).toHaveLength(1);
    expect(slices[0].scanDocumentId).toBe("upload");
    expect(slices[0].sourceUploadId).toBe("upload");
  });

  it("splits a mixed four-document qualification packet and keeps source page numbers", async () => {
    const document = pdfDoc("packet", QUALIFICATION_PACKET_PAGES);
    expect(packetSegmentationNeeded(document)).toBe(true);
    const boundaries: IepLogicalDocumentBoundary[] = [
      {
        logicalDocumentId: "packet:ref",
        sourceUploadId: "packet",
        startPage: 1,
        endPage: 2,
        family: "REFERRAL",
        confidence: 0.9,
        signals: ["referral"],
      },
      {
        logicalDocumentId: "packet:plan",
        sourceUploadId: "packet",
        startPage: 3,
        endPage: 4,
        family: "EVAL_PLAN",
        confidence: 0.9,
        signals: ["plan"],
      },
      {
        logicalDocumentId: "packet:eval",
        sourceUploadId: "packet",
        startPage: 5,
        endPage: 7,
        family: "EVALUATION",
        confidence: 0.9,
        signals: ["eval"],
      },
      {
        logicalDocumentId: "packet:iep",
        sourceUploadId: "packet",
        startPage: 8,
        endPage: 12,
        family: "IEP",
        confidence: 0.9,
        signals: ["iep"],
      },
    ];
    expect(validateLogicalBoundaries(boundaries, 12).ok).toBe(true);
    const { documents } = await segmentIepScanDocuments([document], {
      propose: async () => boundaries,
    });
    expect(documents).toHaveLength(4);
    expect(documents.map((row) => [row.logicalStartPage, row.logicalEndPage])).toEqual([
      [1, 2],
      [3, 4],
      [5, 7],
      [8, 12],
    ]);
    expect(documents[2].pages.map((page) => page.pageNumber)).toEqual([5, 6, 7]);
    expect(documents[2].sourceUploadId).toBe("packet");
    expect(documents.every((row) => row.pages.every((page) => page.pageNumber >= 1))).toBe(true);

    const families = documents.map((slice) => classifyIepDocumentLocally(slice).family);
    expect(families).toEqual(["REFERRAL", "EVAL_PLAN", "EVALUATION", "IEP"]);
  });

  it("classifies each logical document independently through executeIepIntakePack", async () => {
    const normalized = normalizedFromPages("bundled-pdf", QUALIFICATION_PACKET_PAGES);
    const boundaries: IepLogicalDocumentBoundary[] = [
      {
        logicalDocumentId: "bundled-pdf:ref",
        sourceUploadId: "bundled-pdf",
        startPage: 1,
        endPage: 2,
        confidence: 0.9,
      },
      {
        logicalDocumentId: "bundled-pdf:plan",
        sourceUploadId: "bundled-pdf",
        startPage: 3,
        endPage: 4,
        confidence: 0.9,
      },
      {
        logicalDocumentId: "bundled-pdf:eval",
        sourceUploadId: "bundled-pdf",
        startPage: 5,
        endPage: 7,
        confidence: 0.9,
      },
      {
        logicalDocumentId: "bundled-pdf:iep",
        sourceUploadId: "bundled-pdf",
        startPage: 8,
        endPage: 12,
        confidence: 0.9,
      },
    ];
    const result = await executeIepIntakePack({
      domainPackId: "hive.domain.iep",
      domainPackVersion: "0.0.0-scaffold",
      documents: [
        {
          sourceDocumentId: "bundled-pdf",
          filename: "bundled-pdf.pdf",
          genericIdentity: "iep_document",
          normalized,
        },
      ],
      missingExpectations: [],
      packetSegmentationResolver: { propose: async () => boundaries },
    });
    expect(result.logicalDocuments).toHaveLength(4);
    expect(result.logicalDocuments.map((doc) => doc.pageStart)).toEqual([1, 3, 5, 8]);
    expect(result.logicalDocuments.every((doc) => doc.sourceDocumentId === "bundled-pdf")).toBe(true);
    expect(result.completeness.expectations).toEqual([]);
  });

  it("fail-closes invalid boundary proposals to unsplit packet + NEEDS_REVIEW", async () => {
    const document = pdfDoc("packet", QUALIFICATION_PACKET_PAGES);
    const invalidOverlap: IepLogicalDocumentBoundary[] = [
      {
        logicalDocumentId: "a",
        sourceUploadId: "packet",
        startPage: 1,
        endPage: 6,
        confidence: 1,
      },
      {
        logicalDocumentId: "b",
        sourceUploadId: "packet",
        startPage: 5,
        endPage: 12,
        confidence: 1,
      },
    ];
    expect(validateLogicalBoundaries(invalidOverlap, 12).ok).toBe(false);

    const gapOnly = validateLogicalBoundaries(
      [
        {
          logicalDocumentId: "a",
          sourceUploadId: "packet",
          startPage: 1,
          endPage: 2,
          confidence: 1,
        },
        {
          logicalDocumentId: "b",
          sourceUploadId: "packet",
          startPage: 5,
          endPage: 6,
          confidence: 1,
        },
      ],
      12,
    );
    expect(gapOnly.ok).toBe(false);
    expect(gapOnly.errors).toContain("unexplained_gap");

    const outOfRange = validateLogicalBoundaries(
      [
        {
          logicalDocumentId: "a",
          sourceUploadId: "packet",
          startPage: 0,
          endPage: 14,
          confidence: 1,
        },
      ],
      12,
    );
    expect(outOfRange.ok).toBe(false);

    const { documents, diagnostics } = await segmentIepScanDocuments([document], {
      propose: async () => invalidOverlap,
    });
    expect(documents).toHaveLength(1);
    expect(documents[0].logicalStartPage).toBe(1);
    expect(documents[0].logicalEndPage).toBe(12);
    expect(diagnostics.unresolvedPacketUploadIds).toContain("packet");

    const intake = await executeIepIntakePack({
      domainPackId: "hive.domain.iep",
      domainPackVersion: "0.0.0-scaffold",
      documents: [
        {
          sourceDocumentId: "packet",
          filename: "packet.pdf",
          genericIdentity: "iep_document",
          normalized: normalizedFromPages("packet", QUALIFICATION_PACKET_PAGES),
        },
      ],
      missingExpectations: [],
      packetSegmentationResolver: { propose: async () => invalidOverlap },
    });
    expect(intake.logicalDocuments).toHaveLength(1);
    expect(intake.logicalDocuments[0]?.processingDisposition).toBe("NEEDS_REVIEW");
    expect(intake.completeness.collectionNeedsReview).toBe(true);
  });

  it("flags packet segmentation needed when no resolver is configured", async () => {
    const document = pdfDoc("packet", QUALIFICATION_PACKET_PAGES);
    const { documents, diagnostics } = await segmentIepScanDocuments([document]);
    expect(documents).toHaveLength(1);
    expect(diagnostics.unresolvedPacketUploadIds).toContain("packet");

    const scanDoc = iepScanDocumentFromNormalized({
      sourceDocumentId: "packet",
      filename: "packet.pdf",
      mimeType: "application/pdf",
      normalized: normalizedFromPages("packet", QUALIFICATION_PACKET_PAGES),
    });
    expect(scanDoc.sourceUploadId).toBe("packet");
  });
});
