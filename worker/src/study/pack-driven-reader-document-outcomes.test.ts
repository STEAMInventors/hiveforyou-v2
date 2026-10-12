import { describe, expect, it } from "vitest";

import {
  evaluatePackDrivenReaderDocumentOutcomes,
  PackDrivenReaderProductionError,
} from "./pack-driven-reader-document-outcomes.js";

describe("evaluatePackDrivenReaderDocumentOutcomes", () => {
  it("fails when a registered document is missing from perDocumentResults", () => {
    const outcome = evaluatePackDrivenReaderDocumentOutcomes({
      expectedSourceDocumentIds: ["doc-a", "doc-b"],
      perDocumentResults: [{ sourceDocumentId: "doc-a", parseOk: true, documentTypeId: "iep.plan" }],
    });
    expect(outcome).toEqual({
      kind: "failed",
      code: "PACK_DRIVEN_READER_DOCUMENT_FAILED",
      affectedDocumentIds: ["doc-b"],
    });
  });

  it("needs review for UNKNOWN or AMBIGUOUS classifications", () => {
    const outcome = evaluatePackDrivenReaderDocumentOutcomes({
      expectedSourceDocumentIds: ["doc-a"],
      perDocumentResults: [{ sourceDocumentId: "doc-a", parseOk: true, documentTypeId: "UNKNOWN" }],
    });
    expect(outcome.kind).toBe("needs_review");
    if (outcome.kind === "needs_review") {
      expect(outcome.affectedDocumentIds).toEqual(["doc-a"]);
    }
  });

  it("fails on parse or execution errors before review classification", () => {
    const outcome = evaluatePackDrivenReaderDocumentOutcomes({
      expectedSourceDocumentIds: ["doc-a"],
      perDocumentResults: [
        {
          sourceDocumentId: "doc-a",
          parseOk: false,
          parseErrors: ["schema"],
          documentTypeId: "UNKNOWN",
        },
      ],
    });
    expect(outcome.kind).toBe("failed");
  });

  it("PackDrivenReaderProductionError preserves affected document ids", () => {
    const error = new PackDrivenReaderProductionError({
      errorCode: "PACK_DRIVEN_READER_DOCUMENT_FAILED",
      message: "failed",
      affectedDocumentIds: ["doc-1"],
    });
    expect(error.affectedDocumentIds).toEqual(["doc-1"]);
    expect(error.errorCode).toBe("PACK_DRIVEN_READER_DOCUMENT_FAILED");
  });
});
