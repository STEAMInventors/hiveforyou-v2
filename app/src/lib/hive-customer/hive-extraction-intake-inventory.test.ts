import { describe, expect, it } from "vitest";

import type { RawExtractionInspectorDocument } from "@hiveforyou/core";

import {
  mergeInspectorDocumentsWithIntakeInventory,
  mergeIntakeIntoFallbackSourceDocumentIds,
} from "./hive-extraction-intake-inventory";

function doc(partial: Partial<RawExtractionInspectorDocument> & { sourceDocumentId: string }) {
  return {
    logicalDocumentId: null,
    sequenceOrder: null,
    customerLabel: null,
    displayStatus: "MISSING_OUTPUT" as const,
    envelope: null,
    modelDocumentClassification: null,
    parseDiagnostics: [],
    records: [],
    evidenceRefs: [],
    ...partial,
  };
}

describe("mergeIntakeIntoFallbackSourceDocumentIds", () => {
  it("appends intake ids without duplicates", () => {
    expect(
      mergeIntakeIntoFallbackSourceDocumentIds(["src-a"], [
        { sourceDocumentId: "src-a", filename: "a.pdf" },
        { sourceDocumentId: "src-b", filename: "b.pdf" },
      ]),
    ).toEqual(["src-a", "src-b"]);
  });
});

describe("mergeInspectorDocumentsWithIntakeInventory", () => {
  it("adds intake-only rows with filenames while study is RUNNING", () => {
    const merged = mergeInspectorDocumentsWithIntakeInventory({
      inspectorDocuments: [],
      intakeInventory: [
        { sourceDocumentId: "src-1", filename: "IEP_2024.pdf" },
        { sourceDocumentId: "src-2", filename: "Evaluation.pdf" },
      ],
      orderedSourceDocumentIds: [],
    });

    expect(merged).toHaveLength(2);
    expect(merged[0]?.sourceDocumentId).toBe("src-1");
    expect(merged[0]?.customerLabel).toBe("IEP_2024.pdf");
    expect(merged[0]?.displayStatus).toBe("MISSING_OUTPUT");
    expect(merged[1]?.customerLabel).toBe("Evaluation.pdf");
  });

  it("merges reader results by sourceDocumentId and preserves intake filename when label missing", () => {
    const merged = mergeInspectorDocumentsWithIntakeInventory({
      inspectorDocuments: [
        doc({
          sourceDocumentId: "src-1",
          displayStatus: "SUCCEEDED",
          customerLabel: null,
          records: [{ recordTypeId: "x", fields: {} }],
        }),
      ],
      intakeInventory: [
        { sourceDocumentId: "src-1", filename: "IEP_2024.pdf" },
        { sourceDocumentId: "src-2", filename: "Evaluation.pdf" },
      ],
      orderedSourceDocumentIds: ["src-1", "src-2"],
    });

    expect(merged).toHaveLength(2);
    expect(merged[0]?.displayStatus).toBe("SUCCEEDED");
    expect(merged[0]?.customerLabel).toBe("IEP_2024.pdf");
    expect(merged[1]?.displayStatus).toBe("MISSING_OUTPUT");
  });
});
