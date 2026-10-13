import { describe, expect, it } from "vitest";

import { buildSyntheticFoundation, SYNTHETIC_PACK, planGoalDoc, mockPages } from "./test-fixtures.js";
import {
  evaluateScopeSourceCoverage,
  isClassificationResolved,
  resolveClassificationStatus,
} from "./evaluate-source-coverage.js";
import { buildIndexedFoundation } from "./indexed-foundation.js";

describe("evaluateScopeSourceCoverage", () => {
  it("marks scope incomplete when any in-scope document extraction failed", () => {
    const foundation = buildSyntheticFoundation({
      documents: [
        {
          sourceDocumentId: "plan-a",
          pages: mockPages("plan-a", 1, "2024-01-01 goal"),
          parsedModelJson: planGoalDoc("plan-a", "doc.plan", "goal", "2024-01-01"),
        },
        {
          sourceDocumentId: "plan-b",
          pages: mockPages("plan-b", 1, "2024-01-01"),
          parsedModelJson: {
            sourceDocumentId: "plan-b",
            documentTypeId: "doc.plan",
            recordInstances: [],
          },
        },
      ],
    });
    foundation.documents = foundation.documents.map((document) =>
      document.sourceDocumentId === "plan-b"
        ? { ...document, extractionStatus: "MODEL_ERROR" as const }
        : document,
    );

    const indexed = buildIndexedFoundation({
      pack: SYNTHETIC_PACK,
      foundation,
      sourceContext: {},
    });

    const coverage = evaluateScopeSourceCoverage({
      indexed,
      scopeDocumentIds: new Set(["plan-a", "plan-b"]),
      appliesTo: "operative:doc.plan",
    });

    expect(coverage.complete).toBe(false);
    expect(coverage.incompleteDocumentIds).toEqual(["plan-b"]);
    expect(coverage.message).toBe("source_extraction_incomplete:plan-b");
  });

  it("classifies UNKNOWN and AMBIGUOUS model outputs", () => {
    expect(resolveClassificationStatus("iep.plan")).toBe("classified");
    expect(resolveClassificationStatus("UNKNOWN")).toBe("unknown");
    expect(resolveClassificationStatus("AMBIGUOUS")).toBe("ambiguous");
    expect(resolveClassificationStatus(null)).toBe("unclassified");
    expect(isClassificationResolved("classified")).toBe(true);
    expect(isClassificationResolved("unknown")).toBe(false);
  });

  it("blocks absence coverage when a potentially relevant document has unknown classification", () => {
    const foundation = buildSyntheticFoundation({
      documents: [
        {
          sourceDocumentId: "plan-a",
          pages: mockPages("plan-a", 1, "2024-01-01 goal"),
          parsedModelJson: {
            sourceDocumentId: "plan-a",
            documentTypeId: "UNKNOWN",
            recordInstances: planGoalDoc("plan-a", "UNKNOWN", "goal", "2024-01-01").recordInstances,
          },
        },
      ],
    });

    const indexed = buildIndexedFoundation({
      pack: SYNTHETIC_PACK,
      foundation,
      sourceContext: {},
    });

    const extractionOnly = evaluateScopeSourceCoverage({
      indexed,
      scopeDocumentIds: new Set(["plan-a"]),
      appliesTo: "operative:doc.plan",
    });
    expect(extractionOnly.complete).toBe(true);

    const absenceGate = evaluateScopeSourceCoverage({
      indexed,
      scopeDocumentIds: new Set(["plan-a"]),
      appliesTo: "operative:doc.plan",
      mode: "absence",
    });
    expect(absenceGate.complete).toBe(false);
    expect(absenceGate.unresolvedClassificationDocumentIds).toEqual(["plan-a"]);
    expect(absenceGate.message).toBe("source_classification_unresolved:plan-a");
  });

  it("permits absence coverage when unrelated documents are classified outside the scope", () => {
    const foundation = buildSyntheticFoundation({
      documents: [
        {
          sourceDocumentId: "plan-a",
          pages: mockPages("plan-a", 1, "2024-01-01 goal"),
          parsedModelJson: planGoalDoc("plan-a", "doc.plan", "goal", "2024-01-01"),
        },
        {
          sourceDocumentId: "notice-a",
          pages: mockPages("notice-a", 1, "2024-01-01 notice"),
          parsedModelJson: {
            sourceDocumentId: "notice-a",
            documentTypeId: "doc.notice",
            recordInstances: [
              {
                recordTypeId: "document_header",
                instanceIndex: 0,
                fields: [
                  {
                    fieldId: "effective_date",
                    provenance: "quoted",
                    valueKind: "date",
                    value: "2024-01-01",
                    modality: "observed",
                    missingState: null,
                    evidence: { sourceDocumentId: "notice-a", page: 1, quote: "2024-01-01" },
                  },
                ],
              },
            ],
          },
        },
      ],
    });

    const indexed = buildIndexedFoundation({
      pack: SYNTHETIC_PACK,
      foundation,
      sourceContext: {},
    });

    const absenceGate = evaluateScopeSourceCoverage({
      indexed,
      scopeDocumentIds: new Set(["plan-a", "notice-a"]),
      appliesTo: "operative:doc.plan",
      mode: "absence",
    });
    expect(absenceGate.complete).toBe(true);
  });
});
