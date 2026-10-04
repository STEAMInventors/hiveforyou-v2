import { describe, expect, it } from "vitest";

import type { EvidenceReference } from "@hiveforyou/shared/case-intelligence/3";
import type { StructureMap } from "@hiveforyou/shared/discover";
import { HIVE_STRUCTURE_MAP_SCHEMA } from "@hiveforyou/shared/discover";
import type { NormalizedDocumentExtraction } from "@hiveforyou/shared/intake";
import { NORMALIZED_EXTRACTION_SCHEMA_VERSION } from "@hiveforyou/shared/intake";

import { auditValidatedClaimEvidence } from "./audit-validated-claim-evidence";
import { logicalPageNumberFromPhysical } from "./logical-to-physical-page";
import { resolveEvidenceReference } from "./resolve-evidence-reference";

function structureMap(logicalDocuments: StructureMap["logicalDocuments"]): StructureMap {
  return {
    schemaVersion: HIVE_STRUCTURE_MAP_SCHEMA,
    discoverRunId: "discover-1",
    caseId: "case-1",
    producedAt: new Date().toISOString(),
    domainResolution: {
      status: "SINGLE_DOMAIN",
      domainLabel: "Special education records",
      domainId: "iep",
      domainPackId: "hive.domain.iep",
      domainPackVersion: "0.0.0-scaffold",
    },
    sourceDocuments: [
      {
        sourceDocumentId: "src-packet",
        originalFilename: "school_packet.pdf",
        sizeBytes: 1000,
      },
    ],
    logicalDocuments,
    relationships: [],
    discoveryAnswers: [],
    unresolved: [],
    completeness: { status: "complete", expectations: [] },
    provenance: {
      promptVersion: "discover-v2",
      promptSha256: "sha",
      providerId: "test",
    },
  };
}

function normalizedPacketExtraction(): NormalizedDocumentExtraction {
  const line0Text = "Present Levels of Academic Achievement";
  const line1Text = "Annual measurable goal: reading fluency";
  const canonicalText = `${line0Text}\n${line1Text}`;
  return {
    schemaVersion: NORMALIZED_EXTRACTION_SCHEMA_VERSION,
    sourceDocumentId: "src-packet",
    sourceHash: "hash-packet",
    mimeType: "application/pdf",
    detectedKind: "pdf",
    statistics: { pageCount: 12, nativePageCount: 12, ocrPageCount: 0 },
    sourceIssues: [],
    pages: [
      {
        runId: "run-1",
        sourceDocumentId: "src-packet",
        pageNumber: 5,
        extractionMethod: "NATIVE",
        canonicalText,
        lines: [
          {
            text: line0Text,
            startOffset: 0,
            endOffset: line0Text.length,
            order: 0,
            boundingBox: { x: 10, y: 700, width: 400, height: 12 },
          },
          {
            text: line1Text,
            startOffset: line0Text.length + 1,
            endOffset: canonicalText.length,
            order: 1,
            boundingBox: { x: 10, y: 680, width: 420, height: 12 },
          },
        ],
        blocks: [
          {
            startOffset: 0,
            endOffset: canonicalText.length,
            lineIndexes: [0, 1],
            boundingBox: { x: 10, y: 680, width: 420, height: 32 },
          },
        ],
        sourceIssues: [],
      },
    ],
  };
}

const sourceDocuments = [
  {
    stagedDocumentId: "src-packet",
    sourceDocumentId: "src-packet",
    originalFilename: "school_packet.pdf",
    sizeBytes: 1000,
    sha256: "hash-packet",
  },
];

describe("logicalPageNumberFromPhysical", () => {
  it("maps logical page 2 in segment 4..7 to physical page 5", () => {
    const logical = {
      id: "logical-b",
      domainId: "iep",
      sourceDocumentId: "src-packet",
      pageStart: 4,
      pageEnd: 7,
      documentType: "Evaluation",
      title: "Psychoeducational Evaluation",
      familyRole: "evaluation",
      groupId: "evaluations",
      recognitionStatus: "recognized" as const,
      provenance: "UPLOADED_EVIDENCE" as const,
    };
    expect(logicalPageNumberFromPhysical(logical, 5)).toBe(2);
  });
});

describe("resolveEvidenceReference", () => {
  const logicalB = {
    id: "logical-b",
    domainId: "iep",
    sourceDocumentId: "src-packet",
    pageStart: 4,
    pageEnd: 7,
    documentType: "Evaluation",
    title: "Psychoeducational Evaluation",
    familyRole: "evaluation",
    groupId: "evaluations",
    recognitionStatus: "recognized" as const,
    provenance: "UPLOADED_EVIDENCE" as const,
  };

  it("resolves extractionId line to exact snippet, span, and bbox on physical page 5", () => {
    const ref: EvidenceReference = {
      id: "ev-1",
      logicalDocumentId: "logical-b",
      sourceDocumentId: "src-packet",
      sourceType: "document",
      page: 5,
      extractionId: "line:1",
    };
    const resolved = resolveEvidenceReference(ref, {
      structureMap: structureMap([logicalB]),
      sourceDocuments,
      normalizedExtraction: normalizedPacketExtraction(),
      claimId: "claim-1",
    });
    expect(resolved.resolution).toBe("EXACT");
    expect(resolved.physicalPageNumber).toBe(5);
    expect(resolved.logicalPageNumber).toBe(2);
    expect(resolved.sourceFilename).toBe("school_packet.pdf");
    expect(resolved.canonicalTextSnippet).toBe("Annual measurable goal: reading fluency");
    expect(resolved.span).toEqual({
      start: 0,
      end: "Annual measurable goal: reading fluency".length,
    });
    expect(resolved.region).toMatchObject({ x: 10, y: 680, width: 420, height: 12 });
  });

  it("resolves page + span to exact text without fuzzy search", () => {
    const page = normalizedPacketExtraction().pages[0]!;
    const ref: EvidenceReference = {
      id: "ev-span",
      logicalDocumentId: "logical-b",
      sourceDocumentId: "src-packet",
      sourceType: "document",
      page: 5,
      spanStart: 0,
      spanEnd: page.lines[0]!.endOffset,
    };
    const resolved = resolveEvidenceReference(ref, {
      structureMap: structureMap([logicalB]),
      sourceDocuments,
      normalizedExtraction: normalizedPacketExtraction(),
    });
    expect(resolved.resolution).toBe("EXACT");
    expect(resolved.canonicalTextSnippet).toBe("Present Levels of Academic Achievement");
  });

  it("backfills page + snippet to exact geometry when snippet matches page text", () => {
    const ref: EvidenceReference = {
      id: "ev-partial",
      logicalDocumentId: "logical-b",
      sourceDocumentId: "src-packet",
      sourceType: "document",
      page: 5,
      snippet: "Annual measurable goal",
    };
    const resolved = resolveEvidenceReference(ref, {
      structureMap: structureMap([logicalB]),
      sourceDocuments,
      normalizedExtraction: normalizedPacketExtraction(),
    });
    expect(resolved.resolution).toBe("EXACT");
    expect(resolved.canonicalTextSnippet).toBe("Annual measurable goal");
    expect(resolved.span).toEqual({ start: 0, end: "Annual measurable goal".length });
    expect(resolved.region).toMatchObject({ y: 680 });
    expect(resolved.resolutionIssues).toContain("SNIPPET_BACKFILLED");
  });

  it("reports ambiguous snippet matches without inventing geometry", () => {
    const duplicated = normalizedPacketExtraction();
    duplicated.pages[0]!.canonicalText =
      "Annual measurable goal: reading fluency\nAnnual measurable goal: math fluency";
    const ref: EvidenceReference = {
      id: "ev-ambig",
      logicalDocumentId: "logical-b",
      sourceDocumentId: "src-packet",
      sourceType: "document",
      page: 5,
      snippet: "Annual measurable goal",
    };
    const resolved = resolveEvidenceReference(ref, {
      structureMap: structureMap([logicalB]),
      sourceDocuments,
      normalizedExtraction: duplicated,
    });
    expect(resolved.resolution).toBe("PARTIAL");
    expect(resolved.resolutionIssues).toContain("SNIPPET_AMBIGUOUS");
  });

  it("fails closed when normalized extraction is missing", () => {
    const ref: EvidenceReference = {
      id: "ev-missing-ext",
      logicalDocumentId: "logical-b",
      sourceDocumentId: "src-packet",
      sourceType: "document",
      page: 5,
      extractionId: "line:0",
    };
    const resolved = resolveEvidenceReference(ref, {
      structureMap: structureMap([logicalB]),
      sourceDocuments,
      normalizedExtraction: null,
    });
    expect(resolved.resolution).toBe("UNRESOLVED");
    expect(resolved.resolutionIssues).toContain("NORMALIZED_EXTRACTION_MISSING");
  });

  it("fails closed for discarded source and unknown logical document", () => {
    const ref: EvidenceReference = {
      id: "ev-bad",
      logicalDocumentId: "missing-logical",
      sourceDocumentId: "src-packet",
      sourceType: "document",
      page: 5,
      extractionId: "line:0",
    };
    const resolved = resolveEvidenceReference(ref, {
      structureMap: structureMap([logicalB]),
      sourceDocuments,
      normalizedExtraction: normalizedPacketExtraction(),
      discardedSourceDocumentIds: new Set(["src-packet"]),
    });
    expect(resolved.resolution).toBe("UNRESOLVED");
    expect(resolved.resolutionIssues).toEqual(
      expect.arrayContaining(["LOGICAL_DOCUMENT_MISSING", "SOURCE_DISCARDED"]),
    );
  });

  it("fails closed for page out of range and span out of range", () => {
    const ref: EvidenceReference = {
      id: "ev-range",
      logicalDocumentId: "logical-b",
      sourceDocumentId: "src-packet",
      sourceType: "document",
      page: 99,
      spanStart: 0,
      spanEnd: 5000,
    };
    const resolved = resolveEvidenceReference(ref, {
      structureMap: structureMap([logicalB]),
      sourceDocuments,
      normalizedExtraction: normalizedPacketExtraction(),
    });
    expect(resolved.resolution).toBe("UNRESOLVED");
    expect(resolved.resolutionIssues).toEqual(
      expect.arrayContaining([
        "EVIDENCE_PAGE_OUT_OF_RANGE",
        "NORMALIZED_PAGE_MISSING",
      ]),
    );
  });
});

describe("L001-style provenance acceptance fixture", () => {
  it("binds claim evidence to logical document B on physical page 5 with stored line text", () => {
    const logicalB = {
      id: "l001-logical-iep",
      domainId: "iep",
      sourceDocumentId: "l001-iep-src",
      pageStart: 4,
      pageEnd: 7,
      documentType: "Individualized Education Program",
      title: "Annual IEP",
      familyRole: "plan",
      groupId: "planning",
      recognitionStatus: "recognized" as const,
      provenance: "UPLOADED_EVIDENCE" as const,
    };
    const goalLine = "Special education and related services: 300 minutes per week";
    const normalized: NormalizedDocumentExtraction = {
      schemaVersion: NORMALIZED_EXTRACTION_SCHEMA_VERSION,
      sourceDocumentId: "l001-iep-src",
      sourceHash: "l001-hash",
      mimeType: "application/pdf",
      detectedKind: "pdf",
      statistics: { pageCount: 7, nativePageCount: 7, ocrPageCount: 0 },
      sourceIssues: [],
      pages: [
        {
          runId: "l001",
          sourceDocumentId: "l001-iep-src",
          pageNumber: 5,
          extractionMethod: "NATIVE",
          canonicalText: goalLine,
          lines: [
            {
              text: goalLine,
              startOffset: 0,
              endOffset: goalLine.length,
              order: 0,
            },
          ],
          blocks: [{ startOffset: 0, endOffset: goalLine.length, lineIndexes: [0] }],
          sourceIssues: [],
        },
      ],
    };
    const ref: EvidenceReference = {
      id: "l001-ev-goal",
      logicalDocumentId: "l001-logical-iep",
      sourceDocumentId: "l001-iep-src",
      sourceType: "document",
      page: 5,
      extractionId: "line:0",
    };
    const resolved = resolveEvidenceReference(ref, {
      structureMap: structureMap([logicalB]),
      sourceDocuments: [
        {
          stagedDocumentId: "l001-iep-src",
          sourceDocumentId: "l001-iep-src",
          originalFilename: "L001_IEP.pdf",
          sizeBytes: 500_000,
          sha256: "l001-hash",
        },
      ],
      normalizedExtraction: normalized,
    });
    expect(resolved.logicalTitle).toBe("Annual IEP");
    expect(resolved.physicalPageNumber).toBe(5);
    expect(resolved.logicalPageNumber).toBe(2);
    expect(resolved.canonicalTextSnippet).toBe(goalLine);
    expect(resolved.resolution).toBe("EXACT");
  });
});

describe("auditValidatedClaimEvidence", () => {
  it("reports exact, partial, and unresolved refs without dropping any", () => {
    const audit = auditValidatedClaimEvidence({
      snapshot: {
        schemaVersion: "case-intelligence/3",
        version: 1,
        caseId: "case-1",
        studyRunId: "run-1",
        createdAt: new Date().toISOString(),
        caseScope: "single_domain",
        domainId: "iep",
        domainPackId: "hive.domain.iep",
        domainPackVersion: "0.0.0-scaffold",
        entities: [],
        claims: [
          {
            id: "claim-1",
            domainId: "iep",
            subjectEntityId: "ent-1",
            construct: "weekly_minutes",
            value: { kind: "quantity", amount: 300 },
            role: "current",
            evidenceRefs: [
              {
                id: "ev-exact",
                logicalDocumentId: "ld-1",
                sourceDocumentId: "src-1",
                sourceType: "document",
                page: 1,
                extractionId: "line:0",
              },
              {
                id: "ev-partial",
                logicalDocumentId: "ld-1",
                sourceDocumentId: "src-1",
                sourceType: "document",
                page: 1,
                snippet: "partial only",
              },
            ],
            proposalLineage: { proposalItemId: "claim-1", studyRunId: "run-1" },
          },
        ],
        events: [],
        conflicts: [],
        changes: [],
        unresolved: [],
        sourceDocuments: [],
        validationResult: { status: "SUCCEEDED", accepted: { claims: [] }, rejected: [] },
      },
      resolveRef: (_claimId, ref) => ({
        ...ref,
        resolution: ref.id === "ev-exact" ? "EXACT" : "PARTIAL",
      }),
    });
    expect(audit.claimsWithoutEvidence).toHaveLength(0);
    expect(audit.exactCount).toBe(1);
    expect(audit.partialCount).toBe(1);
    expect(audit.unresolvedCount).toBe(0);
    expect(audit.refs).toHaveLength(2);
  });
});
