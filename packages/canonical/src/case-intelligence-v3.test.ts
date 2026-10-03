import { describe, expect, it } from "vitest";

import type { CanonicalStudyContext } from "@hiveforyou/shared/canonical-study";
import type { CanonicalStudyValidationResultV3 } from "@hiveforyou/shared/case-intelligence/3/validation-result";

import { buildCanonicalCaseSnapshot } from "./case-intelligence-v3";

describe("buildCanonicalCaseSnapshot", () => {
  it("maps accepted claims to validated claims with lineage and chronology indexes", () => {
    const context = {
      caseId: "case-1",
      studyRunId: "run-1",
      domainId: "special_education",
      domainPackId: "pack",
      domainPackVersion: "1",
      sourceDocuments: [
        {
          stagedDocumentId: "src-1",
          sourceDocumentId: "src-1",
          originalFilename: "a.pdf",
          sizeBytes: 1,
        },
      ],
    } as CanonicalStudyContext;

    const validation: CanonicalStudyValidationResultV3 = {
      status: "SUCCEEDED",
      accepted: {
        entities: [{ id: "e1", entityType: "person", label: "Student", evidenceRefs: [] }],
        claims: [
          {
            id: "c1",
            subjectEntityId: "e1",
            construct: "reading_score",
            value: { kind: "quantity", amount: 92 },
            unit: "wpm",
            role: "observed",
            occurredOn: "2024-09-01",
            evidenceRefs: [
              {
                id: "ev1",
                sourceDocumentId: "src-1",
                sourceType: "document",
                page: 1,
                snippet: "92 wpm",
              },
            ],
          },
        ],
        conflicts: [],
        missingInformation: [
          {
            id: "m1",
            description: "Latest evaluation date unclear",
            proposalLineage: { proposalItemId: "m1", studyRunId: "run-1" },
          },
        ],
      },
      rejected: [],
      warnings: [],
      unresolved: [],
      validationErrors: [],
      provenanceErrors: [],
      integrityErrors: [],
    };

    const snapshot = buildCanonicalCaseSnapshot(context, validation, 1);
    expect(snapshot.schemaVersion).toBe("case-intelligence/3");
    expect(snapshot.claims).toHaveLength(1);
    expect(snapshot.claims[0]?.proposalLineage.studyRunId).toBe("run-1");
    expect(snapshot.events).toHaveLength(1);
    expect(snapshot.unresolved.some((item) => item.kind === "missing_information")).toBe(true);
    expect(snapshot.sourceDocuments).toHaveLength(1);
  });

  it("emits no changes when two claims share the same normalized value", () => {
    const context = {
      caseId: "case-1",
      studyRunId: "run-1",
      domainId: "special_education",
      domainPackId: "pack",
      domainPackVersion: "1",
      sourceDocuments: [],
    } as CanonicalStudyContext;

    const validation: CanonicalStudyValidationResultV3 = {
      status: "SUCCEEDED",
      accepted: {
        entities: [{ id: "e1", entityType: "person", label: "Student", evidenceRefs: [] }],
        claims: [
          {
            id: "c1",
            subjectEntityId: "e1",
            construct: "service_minutes",
            value: { kind: "quantity", amount: 45 },
            unit: "minutes",
            role: "planned",
            occurredOn: "2023-10-01",
            evidenceRefs: [],
          },
          {
            id: "c2",
            subjectEntityId: "e1",
            construct: "service_minutes",
            value: { kind: "quantity", amount: 45 },
            unit: "minutes",
            role: "planned",
            occurredOn: "2026-10-01",
            evidenceRefs: [],
          },
        ],
        conflicts: [],
        missingInformation: [],
      },
      rejected: [],
      warnings: [],
      unresolved: [],
      validationErrors: [],
      provenanceErrors: [],
      integrityErrors: [],
    };

    const snapshot = buildCanonicalCaseSnapshot(context, validation, 1);
    expect(snapshot.changes).toHaveLength(0);
  });
});
