import { describe, expect, it } from "vitest";

import { sanitizeSchemaForAnthropic } from "../../../engine/model-providers/src/sanitize-schema-for-anthropic.js";

import { loadInitialIepFactCatalog } from "./load-catalog.js";
import { parseExtractionResponse } from "./parse-proposals.js";
import { buildOntologyExtractionOutputSchema } from "./extraction-output-schema.js";

describe("buildOntologyExtractionOutputSchema", () => {
  it("sanitizes for Anthropic constrained output without map-typed additionalProperties", () => {
    const catalog = loadInitialIepFactCatalog();
    const format = buildOntologyExtractionOutputSchema(catalog);
    expect(() => sanitizeSchemaForAnthropic(format.schema)).not.toThrow();
  });

  it("accepts schema-shaped JSON in the strict parser", () => {
    const catalog = loadInitialIepFactCatalog();
    const dateEntry = catalog.entries.find((e) => e.typeId === "clm_iep_date")!;

    const payload = {
      proposals: [
        {
          id: "schema-shaped-1",
          catalogTypeId: "clm_iep_date",
          construct: {
            measure: dateEntry.atomicField,
          },
          value: { kind: "date", dateValue: "2024-11-12" },
          modality: "observed",
          evidence: [{ sourceDocumentId: "l001-src-8", page: 1, quote: "November 12, 2024" }],
        },
      ],
    };

    const parsed = parseExtractionResponse(JSON.stringify(payload), catalog);
    expect(parsed.dropped).toBe(0);
    expect(parsed.proposals).toHaveLength(1);
    expect(parsed.candidates).toHaveLength(1);
  });
});
