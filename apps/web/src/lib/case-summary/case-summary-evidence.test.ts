import { describe, expect, it } from "vitest";

import { shouldShowEvidenceChipLabel } from "./case-summary-evidence";

describe("shouldShowEvidenceChipLabel", () => {
  it("hides generic Source and Document labels", () => {
    expect(shouldShowEvidenceChipLabel("Source")).toBe(false);
    expect(shouldShowEvidenceChipLabel("source · p.2")).toBe(false);
    expect(shouldShowEvidenceChipLabel("Document")).toBe(false);
  });

  it("shows named document citations", () => {
    expect(shouldShowEvidenceChipLabel("02 prior iep · p.1")).toBe(true);
  });
});
