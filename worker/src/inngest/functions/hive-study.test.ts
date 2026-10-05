import { describe, expect, it } from "vitest";

import { HIVE_EVENT_STUDY_REQUESTED } from "@hiveforyou/shared/events";

import { parseStudyFailureEvent } from "./hive-study.js";

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
