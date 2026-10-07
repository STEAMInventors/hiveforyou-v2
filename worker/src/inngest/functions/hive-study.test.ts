import { describe, expect, it } from "vitest";

import { HIVE_EVENT_STUDY_REQUESTED } from "@hiveforyou/shared/events";

import { mergeModelMetrics, parseStudyFailureEvent } from "./hive-study.js";

describe("mergeModelMetrics", () => {
  it("merges token and cache fields when present", () => {
    const merged = mergeModelMetrics(
      { step: "propose", ms: 42, outcome: "ok" },
      {
        provider: "anthropic",
        model: "claude-test",
        inputTokens: 100,
        outputTokens: 50,
        cacheReadInputTokens: 1200,
        cacheWriteInputTokens: 700,
      },
    );
    expect(merged).toEqual({
      step: "propose",
      ms: 42,
      outcome: "ok",
      provider: "anthropic",
      model: "claude-test",
      inputTokens: 100,
      outputTokens: 50,
      cacheReadInputTokens: 1200,
      cacheWriteInputTokens: 700,
    });
  });

  it("omits cache fields when absent", () => {
    const merged = mergeModelMetrics(
      { step: "validate" },
      { provider: "openai", model: "gpt-test", inputTokens: 10 },
    );
    expect(merged).not.toHaveProperty("cacheReadInputTokens");
    expect(merged).not.toHaveProperty("cacheWriteInputTokens");
    expect(merged.inputTokens).toBe(10);
  });
});

describe("parseStudyFailureEvent", () => {
  it("parses study requested payload from inngest/function.failed wrapper", () => {
    const parsed = parseStudyFailureEvent({
      data: {
        event: {
          name: HIVE_EVENT_STUDY_REQUESTED,
          data: {
            userId: "11111111-1111-4111-8111-111111111111",
            caseId: "22222222-2222-4222-8222-222222222222",
            intakeRunId: "intake-1",
            studyRunId: "33333333-3333-4333-8333-333333333333",
          },
        },
      },
    });
    expect(parsed?.studyRunId).toBe("33333333-3333-4333-8333-333333333333");
  });

  it("returns null for unrelated failure events", () => {
    expect(parseStudyFailureEvent({ data: { event: { name: "other", data: {} } } })).toBeNull();
  });
});
