import { describe, expect, it } from "vitest";

import { executeIepIntakePack } from "../execute-intake";
import { selectCurrentAndPriorIep } from "../document-interpreter/temporal-resolution";
import type { NormalizedDocumentExtraction } from "@hiveforyou/shared/intake";
import { NORMALIZED_EXTRACTION_SCHEMA_VERSION } from "@hiveforyou/shared/intake";

function normalized(text: string, id: string): NormalizedDocumentExtraction {
  return {
    schemaVersion: NORMALIZED_EXTRACTION_SCHEMA_VERSION,
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

describe("IEP current-plan selection", () => {
  it("pins the current plan to the latest-dated IEP and the prior plan to 02", async () => {
    const result = await executeIepIntakePack({
      domainPackId: "hive.domain.iep",
      domainPackVersion: "0.0.0-scaffold",
      documents: [
        {
          sourceDocumentId: "doc-09",
          filename: "09_reevaluation_iep.pdf",
          genericIdentity: "iep_document",
          normalized: normalized(
            [
              "Individualized Education Program (IEP)",
              "Student: Caleb Nguyen",
              "Date of Birth: 2016-03-09",
              "IEP Date: 2026-10-21",
              "IEP Period: 2026-10-21 through 2027-10-20",
              "Target date: 2027-10-20",
              "Primary Educational Need: Reading Comprehension",
            ].join("\n"),
            "doc-09",
          ),
        },
        {
          sourceDocumentId: "doc-08",
          filename: "08_reevaluation_eligibility_determination.pdf",
          genericIdentity: "iep_document",
          normalized: normalized(
            [
              "Eligibility Determination",
              "Determination Date: 2026-10-14",
              "Primary Educational Need: Reading Comprehension",
            ].join("\n"),
            "doc-08",
          ),
        },
        {
          sourceDocumentId: "doc-10",
          filename: "10_undated_iep.pdf",
          genericIdentity: "iep_document",
          normalized: normalized(
            "Individualized Education Program (IEP)\nNo meeting date is printed.",
            "doc-10",
          ),
        },
        {
          sourceDocumentId: "doc-04",
          filename: "04_annual_iep.pdf",
          genericIdentity: "iep_document",
          normalized: normalized(
            "Individualized Education Program (IEP)\nIEP Date: 2024-11-01",
            "doc-04",
          ),
        },
        {
          sourceDocumentId: "doc-02",
          filename: "02_prior_iep.pdf",
          genericIdentity: "iep_document",
          normalized: normalized(
            [
              "Individualized Education Program (IEP)",
              "Date of Birth: 2016-03-09",
              "IEP Date: 2023-10-24",
              "Primary Educational Need: Reading Fluency",
            ].join("\n"),
            "doc-02",
          ),
        },
      ],
      missingExpectations: [],
    });

    const plans = selectCurrentAndPriorIep(result.logicalDocuments);
    expect(plans.current).toMatchObject({
      sourceFilename: "09_reevaluation_iep.pdf",
      documentDate: "2026-10-21",
      temporalRole: "current",
    });
    expect(plans.prior).toMatchObject({
      sourceFilename: "02_prior_iep.pdf",
      documentDate: "2023-10-24",
      temporalRole: "prior",
    });

    const undated = result.logicalDocuments.find((doc) => doc.sourceFilename === "10_undated_iep.pdf");
    expect(undated?.temporalRole).toBe("unknown");
    expect(undated?.documentDate ?? null).toBeNull();
  });
});
