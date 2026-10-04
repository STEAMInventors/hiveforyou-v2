import { describe, expect, it } from "vitest";

import { rollupIntakeRunStatus } from "./run-status";

describe("rollupIntakeRunStatus", () => {
  it("succeeds only when every document is classified", () => {
    expect(rollupIntakeRunStatus(["CLASSIFIED", "CLASSIFIED"])).toBe("SUCCEEDED");
  });

  it("keeps the run reviewable when one document fails and another completed", () => {
    expect(rollupIntakeRunStatus(["CLASSIFIED", "FAILED"])).toBe("NEEDS_REVIEW");
    expect(rollupIntakeRunStatus(["NEEDS_OCR", "FAILED"])).toBe("NEEDS_REVIEW");
    expect(rollupIntakeRunStatus(["CLASSIFIED", "NEEDS_OCR"])).toBe("NEEDS_REVIEW");
  });

  it("fails the run only when no usable document result exists", () => {
    expect(rollupIntakeRunStatus(["FAILED", "FAILED"])).toBe("FAILED");
    expect(rollupIntakeRunStatus([])).toBe("FAILED");
  });

  it("stays running until every document is terminal", () => {
    expect(rollupIntakeRunStatus(["CLASSIFIED", "CLASSIFYING"])).toBe("RUNNING");
    expect(rollupIntakeRunStatus(["EXTRACTING"])).toBe("RUNNING");
  });
});
