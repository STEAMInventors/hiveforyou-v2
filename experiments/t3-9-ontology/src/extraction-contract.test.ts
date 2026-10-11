import { describe, expect, it } from "vitest";

import { loadInitialIepFactCatalog } from "./load-catalog.js";
import {
  parseOntologyExtractionResponse,
  parseOntologyProposal,
  validateClaimValueForKind,
} from "./extraction-contract.js";
import type { CatalogValidationContext } from "./extraction-contract.js";

function catalogContext(
  overrides: Partial<CatalogValidationContext> & Pick<CatalogValidationContext, "valueKind" | "atomicField">,
): CatalogValidationContext {
  return {
    acceptableModalities: ["observed"],
    minQuotes: 1,
    ...overrides,
  };
}

describe("validateClaimValueForKind", () => {
  it("accepts quantity with optional unit", () => {
    expect(validateClaimValueForKind({ kind: "quantity", numberValue: 30, unit: "minutes/week" }, "quantity")).toEqual({
      kind: "quantity",
      numberValue: 30,
      unit: "minutes/week",
    });
    expect(validateClaimValueForKind({ kind: "quantity", numberValue: 2 }, "quantity")).toEqual({
      kind: "quantity",
      numberValue: 2,
      unit: undefined,
    });
  });

  it("accepts date, text, code, entity_ref, and period", () => {
    expect(validateClaimValueForKind({ kind: "date", dateValue: "2024-11-12" }, "date")).toEqual({
      kind: "date",
      dateValue: "2024-11-12",
    });
    expect(validateClaimValueForKind({ kind: "text", textValue: "Speech-Language Pathology" }, "text")).toEqual({
      kind: "text",
      textValue: "Speech-Language Pathology",
    });
    expect(validateClaimValueForKind({ kind: "code", codeValue: "SLP" }, "code")).toEqual({
      kind: "code",
      codeValue: "SLP",
    });
    expect(validateClaimValueForKind({ kind: "entity_ref", entityId: "ent-student-1" }, "entity_ref")).toEqual({
      kind: "entity_ref",
      entityId: "ent-student-1",
    });
    expect(
      validateClaimValueForKind(
        { kind: "period", periodStart: "2024-09-01", periodEnd: "2025-06-15" },
        "period",
      ),
    ).toEqual({
      kind: "period",
      periodStart: "2024-09-01",
      periodEnd: "2025-06-15",
    });
  });

  it("rejects wrong kind or missing required fields", () => {
    expect(validateClaimValueForKind({ kind: "text", textValue: "x" }, "date")).toBeNull();
    expect(validateClaimValueForKind({ kind: "date", dateValue: "" }, "date")).toBeNull();
    expect(validateClaimValueForKind({ kind: "period" }, "period")).toBeNull();
  });
});

describe("parseOntologyProposal", () => {
  const catalog = loadInitialIepFactCatalog();
  const catalogByType = new Map(
    catalog.entries.map((entry) => [
      entry.typeId,
      {
        atomicField: entry.atomicField,
        valueKind: entry.valueKind,
        acceptableModalities: entry.acceptableModalities,
        minQuotes: entry.evidenceRequirements.minQuotes,
      },
    ]),
  );

  it("parses strict prompt-shaped proposals for each supported value kind", () => {
    const samples: Array<{ catalogTypeId: string; value: Record<string, unknown> }> = [
      { catalogTypeId: "clm_iep_date", value: { kind: "date", dateValue: "2024-11-12" } },
      {
        catalogTypeId: "clm_iep_period",
        value: { kind: "period", periodStart: "2024-09-01", periodEnd: "2025-06-01" },
      },
      { catalogTypeId: "clm_iep_addresses", value: { kind: "text", textValue: "Reading" } },
      { catalogTypeId: "clm_iep_student", value: { kind: "entity_ref", entityId: "student-1" } },
      {
        catalogTypeId: "clm_service_minutes",
        value: { kind: "quantity", numberValue: 120, unit: "min/week" },
      },
    ];

    for (const [index, sample] of samples.entries()) {
      const entry = catalog.entries.find((e) => e.typeId === sample.catalogTypeId);
      expect(entry).toBeDefined();

      const proposal = parseOntologyProposal(
        {
          id: `contract-${index}`,
          catalogTypeId: sample.catalogTypeId,
          construct: {
            measure: entry!.atomicField,
            task: null,
            administration: null,
          },
          value: sample.value,
          modality: entry!.acceptableModalities[0],
          evidence: [{ sourceDocumentId: "l001-src-8", page: 1, quote: "sample quote text" }],
        },
        index,
        catalogByType,
      );

      expect(proposal).not.toBeNull();
      expect(proposal!.value).toMatchObject(sample.value);
      expect(proposal!.catalogTypeId).toBe(sample.catalogTypeId);
    }

    const codeProposal = parseOntologyProposal(
      {
        id: "code-sample",
        catalogTypeId: "clm_iep_date",
        construct: { measure: "iep.meeting_date", task: null, administration: null },
        value: { kind: "code", codeValue: "DRAFT" },
        modality: "observed",
        evidence: [{ sourceDocumentId: "l001-src-8", page: 1, quote: "DRAFT" }],
      },
      99,
      new Map([
        [
          "clm_iep_date",
          catalogContext({ atomicField: "iep.meeting_date", valueKind: "code" }),
        ],
      ]),
    );
    expect(codeProposal?.value).toEqual({ kind: "code", codeValue: "DRAFT" });
  });

  it("drops legacy typeId alias and snippet-only evidence", () => {
    const parsed = parseOntologyExtractionResponse(
      {
        proposals: [
          {
            id: "legacy-1",
            typeId: "clm_iep_date",
            construct: { measure: "iep.meeting_date", task: null, administration: null },
            value: { kind: "date", dateValue: "2024-11-12" },
            modality: "observed",
            evidence: [{ sourceDocumentId: "l001-src-8", page: 1, snippet: "Nov 12 2024" }],
          },
        ],
      },
      catalogByType,
    );
    expect(parsed.proposals).toHaveLength(0);
    expect(parsed.dropped).toBe(1);
  });
});
