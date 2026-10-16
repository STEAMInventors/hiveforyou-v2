import { describe, expect, it } from "vitest";

import {
  HIVE_EVENT_WRITER_SHADOW_REQUESTED,
  buildHiveWriterShadowRequestedEventId,
  hiveWriterShadowRequestedEventDataSchema,
} from "./index.js";

describe("hive/writer-shadow.requested", () => {
  it("names the event and accepts the owner, case, study, audience, and writerRunId payload", () => {
    expect(HIVE_EVENT_WRITER_SHADOW_REQUESTED).toBe("hive/writer-shadow.requested");
    const parsed = hiveWriterShadowRequestedEventDataSchema.parse({
      userId: "user-1",
      caseId: "case-1",
      studyRunId: "study-1",
      audience: "customer",
      writerRunId: "11111111-1111-4111-8111-111111111111",
    });
    expect(parsed.audience).toBe("customer");
    expect(parsed.writerRunId).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("rejects a missing or unknown audience", () => {
    expect(
      hiveWriterShadowRequestedEventDataSchema.safeParse({
        userId: "user-1",
        caseId: "case-1",
        studyRunId: "study-1",
        writerRunId: "11111111-1111-4111-8111-111111111111",
      }).success,
    ).toBe(false);
    expect(
      hiveWriterShadowRequestedEventDataSchema.safeParse({
        userId: "user-1",
        caseId: "case-1",
        studyRunId: "study-1",
        audience: "public",
        writerRunId: "11111111-1111-4111-8111-111111111111",
      }).success,
    ).toBe(false);
  });

  it("dedupes by writerRunId regardless of audience", () => {
    const runId = "11111111-1111-4111-8111-111111111111";
    expect(buildHiveWriterShadowRequestedEventId(runId)).toBe(`writer-run:${runId}`);
    expect(buildHiveWriterShadowRequestedEventId(runId)).toBe(
      buildHiveWriterShadowRequestedEventId(runId),
    );
  });
});
