import { describe, expect, it } from "vitest";

import { isStudyProcessingDelayed, STUDY_QUEUED_DELAY_MS } from "./processing-delay";

describe("isStudyProcessingDelayed", () => {
  it("is false for RUNNING and fresh QUEUED runs", () => {
    const now = Date.parse("2026-10-04T12:05:00.000Z");
    expect(isStudyProcessingDelayed("RUNNING", "2026-10-04T12:00:00.000Z", now)).toBe(false);
    expect(isStudyProcessingDelayed("QUEUED", "2026-10-04T12:04:00.000Z", now)).toBe(false);
  });

  it("is true when QUEUED longer than five minutes", () => {
    const started = "2026-10-04T12:00:00.000Z";
    const now = Date.parse(started) + STUDY_QUEUED_DELAY_MS + 1;
    expect(isStudyProcessingDelayed("QUEUED", started, now)).toBe(true);
  });
});
