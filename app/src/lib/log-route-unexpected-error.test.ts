import { describe, expect, it, vi } from "vitest";

import {
  logRouteUnexpectedError,
  resolveSafeErrorCode,
  sanitizeStackTraceForLog,
} from "./log-route-unexpected-error";

describe("resolveSafeErrorCode", () => {
  it("prefers explicit errorCode on thrown errors", () => {
    const err = new Error("secret document quote") as Error & { errorCode: string };
    err.errorCode = "WRITER_HTTP_FAILED";
    expect(resolveSafeErrorCode(err)).toBe("WRITER_HTTP_FAILED");
  });

  it("parses a leading SCREAMING_SNAKE code from message prefix", () => {
    expect(resolveSafeErrorCode(new Error("HIVE_UI_TREE_INVALID: props invalid"))).toBe(
      "HIVE_UI_TREE_INVALID",
    );
  });

  it("returns UNKNOWN for unstructured throws", () => {
    expect(resolveSafeErrorCode("plain string")).toBe("UNKNOWN");
  });
});

describe("sanitizeStackTraceForLog", () => {
  it("redacts bearer tokens and long error messages", () => {
    const stack = [
      'Error: Student name "Maria Garcia" and quote "needs specialized instruction"',
      "    at handler (Bearer super-secret-token)",
      "    at Object.sk-live-abc123def",
    ].join("\n");
    const sanitized = sanitizeStackTraceForLog(stack);
    expect(sanitized).not.toContain("Maria Garcia");
    expect(sanitized).not.toContain("super-secret-token");
    expect(sanitized).not.toContain("sk-live-abc123def");
    expect(sanitized).toContain("Bearer [REDACTED]");
    expect(sanitized).toContain("sk-[REDACTED]");
  });
});

describe("logRouteUnexpectedError", () => {
  it("logs route metadata without raw exception messages", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error('CONFIDENTIAL: "IEP goal text"') as Error & { errorCode: string };
    err.errorCode = "PROJECTION_BUILD_FAILED";
    err.stack = 'Error: CONFIDENTIAL: "IEP goal text"\n    at run (/app/route.ts:1:1)';

    logRouteUnexpectedError("api/case/canonical-report", err, {
      studyRunId: "run-abc-123",
    });

    expect(errorSpy).toHaveBeenCalledWith(
      "[api/case/canonical-report] UNEXPECTED",
      expect.objectContaining({
        route: "api/case/canonical-report",
        exceptionClass: "Error",
        safeErrorCode: "PROJECTION_BUILD_FAILED",
        studyRunId: "run-abc-123",
        stack: expect.not.stringContaining("IEP goal text"),
      }),
    );
    expect(JSON.stringify(errorSpy.mock.calls[0]?.[1])).not.toContain("CONFIDENTIAL");

    errorSpy.mockRestore();
  });
});
