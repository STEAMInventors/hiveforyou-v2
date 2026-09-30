import { describe, expect, it } from "vitest";

import type { CanonicalCaseSnapshot } from "@hiveforyou/shared/case-intelligence/3";

import { buildCaseProjectionsV3 } from "./build-and-persist-projections-v3";

function minimalSnapshot(): CanonicalCaseSnapshot {
  return {
    schemaVersion: "case-intelligence/3",
    version: 1,
    caseId: "case-1",
    studyRunId: "run-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    caseScope: "single_domain",
    domainId: "special_education",
    domainPackId: "pack",
    domainPackVersion: "1",
    entities: [{ id: "e1", entityType: "person", label: "Student", evidenceRefs: [] }],
    claims: [
      {
        id: "c1",
        domainId: "special_education",
        subjectEntityId: "e1",
        construct: "service_minutes",
        value: { kind: "quantity", amount: 30 },
        unit: "minutes",
        role: "planned",
        evidenceRefs: [
          {
            id: "ev1",
            sourceDocumentId: "src-1",
            sourceType: "document",
            page: 2,
            snippet: "30 minutes",
          },
        ],
        proposalLineage: { proposalItemId: "c1", studyRunId: "run-1" },
      },
    ],
    events: [],
    conflicts: [],
    changes: [],
    unresolved: [],
    sourceDocuments: [
      {
        stagedDocumentId: "src-1",
        sourceDocumentId: "src-1",
        originalFilename: "iep.pdf",
        sizeBytes: 1,
      },
    ],
    validationResult: {
      status: "SUCCEEDED",
      accepted: { entities: [], claims: [], conflicts: [], missingInformation: [] },
      rejected: [],
      warnings: [],
      unresolved: [],
      validationErrors: [],
      provenanceErrors: [],
      integrityErrors: [],
    },
  };
}

describe("v3 projections", () => {
  it("builds customer and pro views without inventing facts", () => {
    const built = buildCaseProjectionsV3({ intelligence: minimalSnapshot() });
    expect(built.customerView.sections.length).toBeGreaterThan(0);
    expect(built.proView.claims[0]?.statement).toContain("service minutes");
    expect(built.proView.claims[0]?.isFactual).toBe(true);
  });
});
