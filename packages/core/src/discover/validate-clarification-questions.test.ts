import { describe, expect, it } from "vitest";

import { IEP_DISCOVER_PACK } from "@hiveforyou/domain-packs";
import { HIVE_DISCOVER_PROPOSAL_SCHEMA_V2 } from "@hiveforyou/shared/discover";

import { mapValidatedClarificationQuestions } from "./validate-clarification-questions";

describe("mapValidatedClarificationQuestions", () => {
  it("accepts model-proposed clarification questions with valid references", () => {
    const mapped = mapValidatedClarificationQuestions({
      schemaVersion: HIVE_DISCOVER_PROPOSAL_SCHEMA_V2,
      domainResolution: { status: "RESOLVED", domainLabel: IEP_DISCOVER_PACK.domainLabel },
      domainGroups: [
        {
          id: "iep",
          domainId: "iep",
          domainLabel: IEP_DISCOVER_PACK.domainLabel,
          logicalDocumentIds: ["doc-a", "doc-b"],
          description: "Special education records",
          suggestedObjectives: [
            { id: "o1", label: "A", summary: "a" },
            { id: "o2", label: "B", summary: "b" },
            { id: "o3", label: "C", summary: "c" },
          ],
          suggestedAudiences: [{ id: "a1", label: "Just for me", roleHint: "self" }],
        },
      ],
      logicalDocuments: [
        {
          id: "doc-a",
          sourceDocumentId: "src-1",
          pageStart: 1,
          documentType: "Individualized Education Program",
          title: "IEP",
          familyRole: "Service plan",
          groupId: "planning",
          recognitionStatus: "ambiguous",
        },
        {
          id: "doc-b",
          sourceDocumentId: "src-2",
          pageStart: 1,
          documentType: "Psychoeducational evaluation",
          title: "Eval",
          familyRole: "Evaluation report",
          groupId: "evaluations",
          recognitionStatus: "ambiguous",
        },
      ],
      relationships: [],
      ambiguityCandidates: [
        {
          id: "amb-1",
          kind: "DOCUMENT_IDENTITY",
          summary: "May be same sequence",
          relatedLogicalDocumentIds: ["doc-a", "doc-b"],
          affectsStructure: true,
        },
      ],
      clarificationQuestions: [
        {
          id: "cq-1",
          prompt: "Same sequence?",
          humanReason: "Need customer input",
          answerKind: "single_choice",
          options: [
            { id: "yes", label: "Yes" },
            { id: "no", label: "No" },
          ],
          ambiguityCandidateId: "amb-1",
          relatedLogicalDocumentIds: ["doc-a", "doc-b"],
        },
      ],
    });

    expect(mapped.ok).toBe(true);
    if (mapped.ok) {
      expect(mapped.questions).toHaveLength(1);
      expect(mapped.questions[0]?.ambiguityKey).toBe("amb:amb-1");
    }
  });
});
