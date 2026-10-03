import { describe, expect, it } from "vitest";

import { documentDisplayTitle, looksLikeEngineDocumentKey } from "./docRoleLabels";

describe("documentDisplayTitle", () => {
  it("maps classifier families to customer titles", () => {
    expect(looksLikeEngineDocumentKey("ELIGIBILITY")).toBe(true);
    expect(documentDisplayTitle("01 prior eligibility.pdf", "ELIGIBILITY")).toBe(
      "Prior eligibility determination",
    );
    expect(documentDisplayTitle("09 reevaluation iep.pdf", "IEP")).toBe("Individualized Education Program");
    expect(documentDisplayTitle("04 reevaluation plan.pdf", "EVAL_PLAN")).toBe(
      "Special education evaluation plan",
    );
    expect(documentDisplayTitle("06 academic evaluation.pdf", "EVALUATION")).toBe(
      "Academic evaluation report",
    );
    expect(documentDisplayTitle("03 progress report.pdf", "PROGRESS")).toBe("Progress report");
  });

  it("keeps discover catalog document types", () => {
    expect(documentDisplayTitle("x.pdf", "Eligibility Determination")).toBe("Eligibility Determination");
  });
});
