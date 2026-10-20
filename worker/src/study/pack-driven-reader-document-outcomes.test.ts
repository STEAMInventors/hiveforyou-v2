import { describe, expect, it } from "vitest";

import {
  evaluatePackDrivenReaderDocumentOutcomes,
  PackDrivenReaderProductionError,
} from "./pack-driven-reader-document-outcomes.js";
import { evaluatePackDrivenRawExtractionOutcome } from "./pack-driven-reader-document-outcomes.js";

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

  it("raw extraction succeeds for eight persisted SUCCEEDED envelopes", () => {
    const ids = ["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8"];
    const outcome = evaluatePackDrivenRawExtractionOutcome({
      expectedSourceDocumentIds: ids,
      documents: ids.map((sourceDocumentId) => ({ sourceDocumentId, status: "SUCCEEDED" as const })),
    });
    expect(outcome.kind).toBe("succeeded");
  });

  it("raw extraction partial failure keeps seven siblings successful", () => {
    const ids = ["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8"];
    const outcome = evaluatePackDrivenRawExtractionOutcome({
      expectedSourceDocumentIds: ids,
      documents: ids.map((sourceDocumentId, index) => ({
        sourceDocumentId,
        status: index === 4 ? ("MODEL_ERROR" as const) : ("SUCCEEDED" as const),
      })),
    });
    expect(outcome.kind).toBe("partial_failure");
    if (outcome.kind === "partial_failure") {
      expect(outcome.succeededDocumentIds).toHaveLength(7);
      expect(outcome.failedDocumentIds).toEqual(["d5"]);
    }
  });

  it("needs review when Reader classification disagrees with Discover hint", () => {
    const outcome = evaluatePackDrivenReaderDocumentOutcomes({
      expectedSourceDocumentIds: ["doc-a"],
      perDocumentResults: [
        {
          sourceDocumentId: "doc-a",
          parseOk: true,
          documentTypeId: "iep.referral",
          engine1DocumentTypeId: "iep.plan",
        },
      ],
    });
    expect(outcome.kind).toBe("needs_review");
  });

  it("raw extraction treats parseOk=false as failure even when envelope status is SUCCEEDED", () => {
    const outcome = evaluatePackDrivenRawExtractionOutcome({
      expectedSourceDocumentIds: ["doc-a"],
      documents: [{ sourceDocumentId: "doc-a", status: "SUCCEEDED" }],
      perDocumentResults: [{ sourceDocumentId: "doc-a", parseOk: false, parseErrors: ["schema"] }],
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
