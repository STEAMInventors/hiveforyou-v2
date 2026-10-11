import { describe, expect, it } from "vitest";

import { readerWireFactToCandidateFact } from "../../../engine/eval/src/reader-experiment/fact-match.js";

import type { CatalogValidationContext } from "./extraction-contract.js";
import { adaptOntologyProposalToReaderWire } from "./ontology-to-reader.js";

const catalogByTypeId = new Map<string, CatalogValidationContext>([
  [
    "clm_iep_date",
    {
      atomicField: "iep.meeting_date",
      valueKind: "date",
      acceptableModalities: ["observed"],
      minQuotes: 1,
    },
  ],
  [
    "clm_iep_period",
    {
      atomicField: "iep.effective_period",
      valueKind: "period",
      acceptableModalities: ["planned"],
      minQuotes: 1,
    },
  ],
]);

const fixtureProposals = [
  {
    id: "p-date",
    catalogTypeId: "clm_iep_date",
    construct: { measure: "iep.meeting_date", task: null, administration: null },
    value: { kind: "date", dateValue: "2024-11-12" },
    modality: "observed",
    evidence: [{ sourceDocumentId: "doc-iep", page: 2, quote: "IEP date November 12, 2024" }],
  },
  {
    id: "p-period",
    catalogTypeId: "clm_iep_period",
    construct: { measure: "iep.effective_period", task: null, administration: null },
    value: { kind: "period", periodStart: "2024-11-12", periodEnd: "2025-11-11" },
    modality: "planned",
    evidence: [{ sourceDocumentId: "doc-iep", page: 1, quote: "Effective through November 11, 2025" }],
  },
  {
    id: "p-no-evidence",
    catalogTypeId: "clm_iep_date",
    construct: { measure: "iep.meeting_date", task: null, administration: null },
    value: { kind: "date", dateValue: "2024-11-12" },
    modality: "observed",
    evidence: [],
  },
  {
    id: "p-period-prose",
    catalogTypeId: "clm_iep_period",
    construct: { measure: "iep.effective_period", task: null, administration: null },
    value: { kind: "text", textValue: "2024-11-12 through 2025-11-11" },
    modality: "planned",
    evidence: [{ sourceDocumentId: "doc-iep", page: 3, quote: "Annual IEP period" }],
  },
];

describe("ontology-to-reader adapter", () => {
  it("maps strict contract proposals to Reader wire facts (2 of 4 candidates)", () => {
    let adaptedCount = 0;

    for (const raw of fixtureProposals) {
      const adapted = adaptOntologyProposalToReaderWire(raw, catalogByTypeId);
      expect(adapted.ok || adapted.dropReason).toBeTruthy();
      if (adapted.ok) {
        const candidate = readerWireFactToCandidateFact(adapted.wire);
        if (candidate) {
          adaptedCount += 1;
        }
      }
    }

    expect(adaptedCount).toBe(2);
  });

  it("reports untranslatable value when kind does not match catalog valueKind", () => {
    const raw = fixtureProposals[3];
    const result = adaptOntologyProposalToReaderWire(raw, catalogByTypeId);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.dropReason).toBe("untranslatable_value");
      expect(result.untranslatableFields).toContain("value");
    }
  });
});
