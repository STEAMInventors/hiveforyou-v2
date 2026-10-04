import { describe, expect, it } from "vitest";

import { intakePreRunSubtitle } from "./intake-upload-phases";

describe("intakePreRunSubtitle", () => {
  it("describes commit phase for multiple files", () => {
    expect(intakePreRunSubtitle("committing", 3)).toMatch(/Saving 3 documents/);
  });

  it("describes start phase", () => {
    expect(intakePreRunSubtitle("starting-intake", 2)).toMatch(/Starting read across/);
  });
});
