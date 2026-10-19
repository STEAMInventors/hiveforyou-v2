import { describe, expect, it } from "vitest";

import { claimValueFromWire } from "./wire-fact.js";

describe("claimValueFromWire", () => {
  it("maps Reader period transport slots to canonical period values", () => {
    expect(
      claimValueFromWire({
        kind: "period",
        numberValue: null,
        textValue: null,
        codeValue: null,
        booleanValue: null,
        entityId: null,
        dateValue: null,
        periodStart: "2024-11-12",
        periodEnd: "2025-11-11",
      }),
    ).toEqual({
      kind: "period",
      start: "2024-11-12",
      end: "2025-11-11",
    });
  });

  it("accepts partial periods and start/end aliases without domain branching", () => {
    expect(
      claimValueFromWire({
        kind: "period",
        start: "2020-01-01",
      }),
    ).toEqual({ kind: "period", start: "2020-01-01" });

    expect(
      claimValueFromWire({
        kind: "period",
        periodEnd: "2021-06-30",
      }),
    ).toEqual({ kind: "period", end: "2021-06-30" });
  });

  it("returns null for malformed period values (quarantine path)", () => {
    expect(
      claimValueFromWire({
        kind: "period",
        periodStart: "",
        periodEnd: "   ",
      }),
    ).toBeNull();

    expect(
      claimValueFromWire({
        kind: "period",
        numberValue: null,
        textValue: null,
      }),
    ).toBeNull();
  });

  it("does not coerce period payloads to text", () => {
    expect(
      claimValueFromWire({
        kind: "period",
        textValue: "2024-11-12 to 2025-11-11",
        periodStart: "2024-11-12",
        periodEnd: "2025-11-11",
      }),
    ).toEqual({
      kind: "period",
      start: "2024-11-12",
      end: "2025-11-11",
    });
  });
});
