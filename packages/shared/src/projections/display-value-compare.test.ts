import { describe, expect, it } from "vitest";

import { claimValuesEqual } from "./display-value-compare";

describe("claimValuesEqual", () => {
  it("treats identical quantity claims as equal", () => {
    expect(
      claimValuesEqual(
        { kind: "quantity", amount: 45 },
        "minutes",
        { kind: "quantity", amount: 45 },
        "minutes",
      ),
    ).toBe(true);
  });

  it("treats different amounts as not equal", () => {
    expect(
      claimValuesEqual(
        { kind: "quantity", amount: 45 },
        "minutes",
        { kind: "quantity", amount: 50 },
        "minutes",
      ),
    ).toBe(false);
  });

  it("compares text case-insensitively", () => {
    expect(
      claimValuesEqual(
        { kind: "text", text: "Reading Fluency" },
        null,
        { kind: "text", text: "reading fluency" },
        null,
      ),
    ).toBe(true);
  });
});
