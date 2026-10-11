import { describe, expect, it } from "vitest";

import { packExtractionToCandidateFacts, packValueToClaimValueV4 } from "./map-extraction-to-candidate.js";

describe("packValueToClaimValueV4", () => {
  it("maps text and date primitives", () => {
    expect(packValueToClaimValueV4("text", "Hello")).toEqual({ kind: "text", textValue: "Hello" });
    expect(packValueToClaimValueV4("date", "2017-04-18")).toEqual({
      kind: "date",
      dateValue: "2017-04-18",
    });
  });
});

describe("packExtractionToCandidateFacts", () => {
  it("skips missing-state rows and emits evidence-backed candidates", () => {
    const candidates = packExtractionToCandidateFacts({
      sourceDocumentId: "l001-src-1",
      recordInstances: [
        {
          recordTypeId: "student",
          instanceIndex: 0,
          fields: [
            {
              fieldId: "name",
              valueKind: "text",
              value: "Maya Carter",
              modality: "observed",
              missingState: null,
              evidence: {
                sourceDocumentId: "l001-src-1",
                page: 1,
                quote: "Student: Maya Carter",
              },
            },
            {
              fieldId: "grade",
              valueKind: "code",
              value: "2",
              modality: "observed",
              missingState: "not_found_in_supplied_documents",
              evidence: null,
            },
          ],
        },
      ],
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.construct.measure).toBe("student.name");
    expect(candidates[0]?.evidenceRefs[0]?.quote).toContain("Maya");
  });
});
