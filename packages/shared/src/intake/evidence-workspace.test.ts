import { describe, expect, it } from "vitest";

import { buildIntakeSourceFiles, toIntakeEvidenceWorkspaceView } from "./evidence-workspace";

describe("buildIntakeSourceFiles", () => {
  it("uses pack customer labels and groups multi-logical documents on one file", () => {
    const files = buildIntakeSourceFiles({
      documents: [
        {
          sourceDocumentId: "src-packet",
          processingStatus: "CLASSIFIED",
          proposedType: "iep_document",
          filename: "school_packet.pdf",
          sizeBytes: 2_400_000,
          mimeType: "application/pdf",
          analysisDisposition: "PRESENT",
          hasNormalizedExtraction: true,
        },
      ],
      packExecution: {
        logicalDocuments: [
          {
            logicalDocumentId: "src-packet:1-2",
            sourceDocumentId: "src-packet",
            pageStart: 1,
            pageEnd: 2,
            processingDisposition: "PROCESS",
            customerLabel: "Evaluation Plan",
          },
          {
            logicalDocumentId: "src-packet:3-7",
            sourceDocumentId: "src-packet",
            pageStart: 3,
            pageEnd: 7,
            processingDisposition: "PROCESS",
            customerLabel: "Psychoeducational Evaluation",
          },
        ],
        completeness: { expectations: [], collectionNeedsReview: false },
      },
    });

    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({
      filename: "school_packet.pdf",
      fileTypeLabel: "PDF",
      documentTypeSummary: "2 documents",
    });
    expect(files[0]?.logicalDocuments).toHaveLength(2);
  });

  it("includes discarded sources with DISCARDED disposition for workspace UI", () => {
    const files = buildIntakeSourceFiles({
      documents: [
        {
          sourceDocumentId: "src-1",
          processingStatus: "CLASSIFIED",
          proposedType: "iep_document",
          filename: "a.pdf",
          sizeBytes: 100,
          mimeType: "application/pdf",
          analysisDisposition: "DISCARDED",
          hasNormalizedExtraction: true,
        },
      ],
      packExecution: null,
    });
    expect(files).toHaveLength(1);
    expect(files[0]?.disposition).toBe("DISCARDED");
  });
});

describe("toIntakeEvidenceWorkspaceView", () => {
  it("does not surface things that would help when completeness is empty", () => {
    const view = toIntakeEvidenceWorkspaceView({
      run: { id: "run-1", status: "SUCCEEDED", caseId: "case-1" },
      documents: [],
      purpose: {
        rawIntent: "IEP Prep",
        explicitDomainId: "iep",
        resolvedDomainId: "iep",
        resolutionSource: "EXPLICIT",
        displayPurpose: "IEP Prep",
        domainName: "Special Education / IEP",
      },
      studyPath: "DOMAIN_PACK",
      packExecution: {
        logicalDocuments: [],
        completeness: { expectations: [], collectionNeedsReview: false },
      },
    });
    expect(view.thingsThatWouldHelp).toEqual([]);
  });
});
