import { describe, expect, it } from "vitest";

import type { RawExtractionInspectorDocument } from "@hiveforyou/core";

import {
  customerStatusLabel,
  humanizeExtractionFieldKey,
  isPackDrivenExtractionExploreReady,
  mapInspectorDocumentToCustomerExtractedDetails,
  mapInspectorDocumentToCustomerRow,
  resolveReliableSubjectFirstName,
} from "./map-customer-extraction-ui-state";

function doc(partial: Partial<RawExtractionInspectorDocument>): RawExtractionInspectorDocument {
  return {
    sourceDocumentId: "src-1",
    logicalDocumentId: null,
    sequenceOrder: null,
    customerLabel: "Referral",
    displayStatus: "MISSING_OUTPUT",
    envelope: null,
    modelDocumentClassification: null,
    parseDiagnostics: [],
    records: [],
    evidenceRefs: [],
    ...partial,
  };
}

describe("mapInspectorDocumentToCustomerRow", () => {
  it("maps SUCCEEDED to read with detail count", () => {
    const row = mapInspectorDocumentToCustomerRow({
      doc: doc({
        displayStatus: "SUCCEEDED",
        records: [{ recordTypeId: "a", fields: {} }],
      }),
      studyRunStatus: "SUCCEEDED",
      rawExtractionOutcome: "succeeded",
      failedDocumentIds: [],
      succeededDocumentIds: ["src-1"],
      documentDateBySourceId: new Map([["src-1", "2024-08-01"]]),
    });
    expect(row.uiStatus).toBe("read");
    expect(row.detailCount).toBe(1);
    expect(row.dateLabel).toMatch(/2024/);
    expect(row.extractedDetails).toEqual([]);
  });

  it("maps readable field values and provenance for customer review", () => {
    const details = mapInspectorDocumentToCustomerExtractedDetails(
      doc({
        displayStatus: "SUCCEEDED",
        customerLabel: "IEP",
        records: [
          {
            recordTypeId: "student",
            fields: {
              firstName: {
                value: "Maya",
                evidence: {
                  sourceDocumentId: "src-1",
                  fieldPath: "student.firstName",
                  quote: "Student Name: Maya",
                  page: 2,
                },
              },
            },
          },
        ],
      }),
      "IEP",
    );
    expect(humanizeExtractionFieldKey("firstName")).toBe("First name");
    expect(details).toEqual([
      {
        label: "First name",
        value: "Maya",
        provenance: { text: "Student Name: Maya", chipLabel: "IEP · p.2" },
      },
    ]);
  });

  it("does not invent reading or next states for missing output while processing", () => {
    const row = mapInspectorDocumentToCustomerRow({
      doc: doc({ displayStatus: "MISSING_OUTPUT" }),
      studyRunStatus: "RUNNING",
      rawExtractionOutcome: null,
      failedDocumentIds: [],
      succeededDocumentIds: [],
      documentDateBySourceId: new Map(),
    });
    expect(row.uiStatus).toBe("waiting");
    expect(customerStatusLabel(row.uiStatus)).toBe("Waiting");
  });

  it("maps failed document ids on partial_failure", () => {
    const row = mapInspectorDocumentToCustomerRow({
      doc: doc({ sourceDocumentId: "src-2", displayStatus: "MISSING_OUTPUT" }),
      studyRunStatus: "FAILED",
      rawExtractionOutcome: "partial_failure",
      failedDocumentIds: ["src-2"],
      succeededDocumentIds: [],
      documentDateBySourceId: new Map(),
    });
    expect(row.uiStatus).toBe("failed");
  });
});

describe("isPackDrivenExtractionExploreReady", () => {
  it("allows explore only on succeeded outcome", () => {
    expect(isPackDrivenExtractionExploreReady("succeeded")).toBe(true);
    expect(isPackDrivenExtractionExploreReady("partial_failure")).toBe(false);
    expect(isPackDrivenExtractionExploreReady("failed")).toBe(false);
    expect(isPackDrivenExtractionExploreReady(null)).toBe(false);
  });
});

describe("resolveReliableSubjectFirstName", () => {
  it("returns null when names disagree", () => {
    const names = resolveReliableSubjectFirstName([
      doc({
        displayStatus: "SUCCEEDED",
        records: [
          {
            recordTypeId: "student",
            fields: {
              firstName: { value: "Maya", evidence: null },
            },
          },
        ],
      }),
      doc({
        sourceDocumentId: "src-2",
        displayStatus: "SUCCEEDED",
        records: [
          {
            recordTypeId: "student",
            fields: {
              firstName: { value: "Alex", evidence: null },
            },
          },
        ],
      }),
    ]);
    expect(names).toBeNull();
  });
});
