import { describe, expect, it } from "vitest";

import {
  buildIntakeStudyUserContext,
  readStatedWorkPurpose,
  STATED_WORK_PURPOSE_CONTEXT_KEY,
} from "./work-purpose";

describe("work purpose snapshot helpers", () => {
  it("round-trips stated work purpose on userContext", () => {
    const ctx = buildIntakeStudyUserContext("  My child's IEP is next week  ");
    expect(ctx?.[STATED_WORK_PURPOSE_CONTEXT_KEY]).toBe("My child's IEP is next week");
    expect(readStatedWorkPurpose(ctx)).toBe("My child's IEP is next week");
  });

  it("returns null for empty purpose", () => {
    expect(buildIntakeStudyUserContext("   ")).toBeNull();
    expect(readStatedWorkPurpose(null)).toBeNull();
  });
});
