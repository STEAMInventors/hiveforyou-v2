import { describe, expect, it } from "vitest";

import {
  HIVE_EVENT_WRITER_SHADOW_REQUESTED,
  buildHiveWriterShadowRequestedEventId,
  hiveWriterShadowRequestedEventDataSchema,
} from "./index.js";

describe("hive/writer-shadow.requested", () => {
  it("names the event and accepts the owner, case, study, and audience payload", () => {
    expect(HIVE_EVENT_WRITER_SHADOW_REQUESTED).toBe("hive/writer-shadow.requested");
    const parsed = hiveWriterShadowRequestedEventDataSchema.parse({
      userId: "user-1",
      caseId: "case-1",
      studyRunId: "study-1",
      audience: "customer",
    });
    expect(parsed.audience).toBe("customer");
  });

  it("rejects a missing or unknown audience", () => {
    expect(
      hiveWriterShadowRequestedEventDataSchema.safeParse({
        userId: "user-1",
        caseId: "case-1",
        studyRunId: "study-1",
      }).success,
    ).toBe(false);
    expect(
      hiveWriterShadowRequestedEventDataSchema.safeParse({
        userId: "user-1",
        caseId: "case-1",
        studyRunId: "study-1",
        audience: "public",
      }).success,
    ).toBe(false);
  });

  it("dedupes customer and pro separately for the same projection binding", () => {
    const key = "a".repeat(64);
    const customer = buildHiveWriterShadowRequestedEventId({
      studyRunId: "study-1",
      audience: "customer",
      idempotencyKey: key,
    });
    const pro = buildHiveWriterShadowRequestedEventId({
      studyRunId: "study-1",
      audience: "pro",
      idempotencyKey: key,
    });
    expect(customer).not.toBe(pro);
    expect(
      buildHiveWriterShadowRequestedEventId({
        studyRunId: "study-1",
        audience: "customer",
        idempotencyKey: key,
      }),
    ).toBe(customer);
  });
});
