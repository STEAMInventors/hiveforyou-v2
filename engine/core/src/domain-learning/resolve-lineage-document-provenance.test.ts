import { describe, expect, it } from "vitest";

import type { CanonicalStudyContext } from "@hiveforyou/shared/canonical-study";
import { CANONICAL_STUDY_CONTEXT_SCHEMA } from "@hiveforyou/shared/canonical-study";

import { resolveLineageDocumentProvenance } from "./resolve-lineage-document-provenance";

const SOURCE_UUID = "33333333-3333-4333-8333-333333333333";

function minimalContext(
  overrides: Partial<CanonicalStudyContext> = {},
): CanonicalStudyContext {
  return {
    schemaVersion: CANONICAL_STUDY_CONTEXT_SCHEMA,
    caseId: "case-1",
    studyRunId: "run-1",
    idempotencyKey: "idem",
    createdAt: "2026-01-01T00:00:00.000Z",
    domainLabel: "Special education records",
    domainId: "iep",
    domainPackId: "hive.domain.iep",
    domainPackVersion: "scaffold",
    domainPackVocabulary: {},
    sourceDocuments: [
      {
        stagedDocumentId: "staged-1",
        sourceDocumentId: SOURCE_UUID,
        originalFilename: "referral.pdf",
        sizeBytes: 100,
      },
    ],
    engine1Result: {
      domainLabel: "Special education records",
      domainResolutionStatus: "resolved",
      groups: [],
      documents: [],
      relationships: [],
      missingDocuments: [],
    },
    questionSetVersion: "qs-1",
    questionSet: { id: "qs-1", questions: [] },
    answerSnapshot: {
      questionSetId: "qs-1",
      answers: {},
      missingNodeStates: {},
      ambiguityNodeStates: {},
      analysisIntent: null,
      userContext: null,
    },
    logicalDocuments: [
      {
        id: "ld-referral",
        domainId: "iep",
        sourceDocumentId: SOURCE_UUID,
        pageStart: 1,
        pageEnd: 2,
        documentType: "Referral",
        title: "Referral",
        familyRole: "evaluation",
        groupId: "evaluations",
        recognitionStatus: "recognized",
        provenance: "UPLOADED_EVIDENCE",
      },
    ],
    processingPolicy: {
      intentAffectsFacts: false,
      providerId: "fixture",
      providerMode: "fixture",
    },
    ...overrides,
  };
}

describe("resolveLineageDocumentProvenance", () => {
  it("keeps opaque logical ids and maps persisted source document uuid", () => {
    const resolved = resolveLineageDocumentProvenance(
      {
        id: "ev-1",
        sourceDocumentId: "ld-referral",
        sourceType: "document",
      },
      minimalContext(),
    );

    expect(resolved.logicalDocumentId).toBe("ld-referral");
    expect(resolved.sourceDocumentId).toBe(SOURCE_UUID);
  });

  it("uses explicit logicalDocumentId when sourceDocumentId is the upload uuid", () => {
    const resolved = resolveLineageDocumentProvenance(
      {
        id: "ev-2",
        sourceDocumentId: SOURCE_UUID,
        logicalDocumentId: "ld-referral",
        sourceType: "document",
      },
      minimalContext(),
    );

    expect(resolved.logicalDocumentId).toBe("ld-referral");
    expect(resolved.sourceDocumentId).toBe(SOURCE_UUID);
  });

  it("matches fixture-style doc-* logical ids used in discover tests", () => {
    const resolved = resolveLineageDocumentProvenance(
      {
        id: "ev-3",
        sourceDocumentId: "doc-staged-1",
        sourceType: "document",
      },
      minimalContext({
        logicalDocuments: [
          {
            id: "doc-staged-1",
            domainId: "iep",
            sourceDocumentId: SOURCE_UUID,
            pageStart: 1,
            documentType: "IEP",
            title: "IEP",
            familyRole: "plan",
            groupId: "planning",
            recognitionStatus: "recognized",
            provenance: "UPLOADED_EVIDENCE",
          },
        ],
      }),
    );

    expect(resolved.logicalDocumentId).toBe("doc-staged-1");
    expect(resolved.sourceDocumentId).toBe(SOURCE_UUID);
  });
});
