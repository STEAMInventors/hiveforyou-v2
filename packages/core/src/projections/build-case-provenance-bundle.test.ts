import { describe, expect, it } from "vitest";

import type { CaseIntelligenceSnapshot } from "@hiveforyou/canonical";

import { buildCaseProvenanceBundle } from "./build-case-provenance-bundle";

describe("buildCaseProvenanceBundle", () => {
  it("resolves logical and source metadata without inventing facts", () => {
    const intelligence = {
      caseId: "case-1",
      version: 1,
      sourceDocuments: [
        {
          stagedDocumentId: "staged-1",
          sourceDocumentId: "src-1",
          originalFilename: "report.pdf",
          sizeBytes: 100,
          sha256: "abc",
        },
      ],
      claims: [
        {
          id: "claim-1",
          claimType: "record_statement",
          statement: "A goal is documented.",
          isFactual: true,
          evidenceRefs: [
            {
              id: "ev-1",
              logicalDocumentId: "logical-1",
              sourceDocumentId: "src-1",
              sourceType: "document",
              page: 2,
            },
          ],
        },
      ],
    } as unknown as CaseIntelligenceSnapshot;

    const bundle = buildCaseProvenanceBundle({
      intelligence,
      structureMap: {
        schemaVersion: "hive-structure-map/1",
        discoverRunId: "run-1",
        caseId: "case-1",
        producedAt: new Date().toISOString(),
        domainResolution: {
          status: "resolved",
          domainLabel: "Special education records",
          domainId: "iep",
          domainPackId: "hive.domain.iep",
          domainPackVersion: "0.0.0-scaffold",
        },
        sourceDocuments: [],
        logicalDocuments: [
          {
            id: "logical-1",
            domainId: "iep",
            sourceDocumentId: "src-1",
            pageStart: 1,
            documentType: "IEP",
            title: "Annual IEP",
            familyRole: "plan",
            groupId: "planning",
            recognitionStatus: "recognized",
            provenance: "UPLOADED_EVIDENCE",
          },
        ],
        relationships: [],
        chronology: [],
        discoveryAnswers: [],
        unresolved: [],
        completeness: { status: "complete", expectations: [] },
        provenance: {
          promptVersion: "discover-v2",
          promptSha256: "sha",
          providerId: "fixture",
        },
      },
    });

    expect(bundle.claims[0]?.documentEvidence[0]?.logicalTitle).toBe("Annual IEP");
    expect(bundle.claims[0]?.documentEvidence[0]?.sourceFilename).toBe("report.pdf");
    expect(bundle.claims[0]?.documentEvidence[0]?.sha256).toBe("abc");
  });
});
