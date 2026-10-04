import { describe, expect, it } from "vitest";

import { INTAKE_QUEUED_DELAY_MS, isIntakeProcessingDelayed } from "./document-identity";

describe("isIntakeProcessingDelayed", () => {
  it("is false for RUNNING and fresh QUEUED runs", () => {
    const now = Date.parse("2026-10-04T12:10:00.000Z");
    expect(isIntakeProcessingDelayed("RUNNING", "2026-10-04T12:00:00.000Z", now)).toBe(false);
    expect(isIntakeProcessingDelayed("QUEUED", "2026-10-04T12:06:00.000Z", now)).toBe(false);
  });

  it("is true when QUEUED longer than five minutes", () => {
    const started = "2026-10-04T12:00:00.000Z";
    const now = Date.parse(started) + INTAKE_QUEUED_DELAY_MS + 1;
    expect(isIntakeProcessingDelayed("QUEUED", started, now)).toBe(true);
  });
});
