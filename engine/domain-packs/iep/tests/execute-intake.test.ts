import { describe, expect, it } from "vitest";

import { executeIepIntakePack } from "../execute-intake";
import type { NormalizedDocumentExtraction } from "@hiveforyou/shared/intake";
import {
  NORMALIZED_EXTRACTION_SCHEMA_VERSION,
  NESTIEP_EXTRACTOR_VERSION,
} from "@hiveforyou/shared/intake";

function normalized(text: string, id: string): NormalizedDocumentExtraction {
  return {
    schemaVersion: NORMALIZED_EXTRACTION_SCHEMA_VERSION,
    extractorVersion: NESTIEP_EXTRACTOR_VERSION,
    sourceDocumentId: id,
    sourceHash: "hash",
    mimeType: "application/pdf",
    detectedKind: "pdf",
    statistics: { pageCount: 1, nativePageCount: 1, ocrPageCount: 0 },
    sourceIssues: [],
    pages: [
      {
        runId: id,
        sourceDocumentId: id,
        pageNumber: 1,
        extractionMethod: "NATIVE",
        canonicalText: text,
        lines: [],
        blocks: [],
        sourceIssues: [],
      },
    ],
  };
}

describe("executeIepIntakePack", () => {
  it("classifies psychoeducational evaluation text with specific subtype", async () => {
    const result = await executeIepIntakePack({
      domainPackId: "hive.domain.iep",
      domainPackVersion: "0.0.0-scaffold",
      documents: [
        {
          sourceDocumentId: "doc-1",
          filename: "eval.pdf",
          genericIdentity: "iep_document",
          normalized: normalized(
            "Psychoeducational Evaluation Report\nStudent achievement testing",
            "doc-1",
          ),
        },
      ],
      missingExpectations: [],
    });
    expect(result.logicalDocuments[0]?.documentFamily).toBe("EVALUATION");
    expect(result.logicalDocuments[0]?.documentSubtype).toBe("psychoeducational_evaluation");
    expect(result.logicalDocuments[0]?.customerLabel).toBe("Psychoeducational Evaluation");
  });

  it("keeps a short signature in the study when it is too short to classify", async () => {
    const result = await executeIepIntakePack({
      domainPackId: "hive.domain.iep",
      domainPackVersion: "0.0.0-scaffold",
      documents: [
        {
          sourceDocumentId: "doc-short",
          filename: "signature.pdf",
          genericIdentity: "other",
          normalized: normalized("Signed: J. Doe", "doc-short"),
        },
      ],
      missingExpectations: [],
    });
    expect(result.logicalDocuments).toHaveLength(1);
    expect(result.logicalDocuments[0]?.sourceDocumentId).toBe("doc-short");
    expect(result.logicalDocuments[0]?.processingDisposition).toBe("NEEDS_REVIEW");
  });
});
