import { describe, expect, it } from "vitest";

import { sanitizeOAuthNextPath } from "./oauth-redirect";

describe("sanitizeOAuthNextPath", () => {
  it("keeps an in-app path", () => {
    expect(sanitizeOAuthNextPath("/intake/run-1")).toBe("/intake/run-1");
    expect(sanitizeOAuthNextPath("/intake/run-1?tab=files")).toBe("/intake/run-1?tab=files");
  });

  it("rejects absolute, protocol-relative, and empty targets", () => {
    expect(sanitizeOAuthNextPath("https://evil.example/phish")).toBe("/");
    expect(sanitizeOAuthNextPath("//evil.example")).toBe("/");
    expect(sanitizeOAuthNextPath("/\\evil.example")).toBe("/");
    expect(sanitizeOAuthNextPath("")).toBe("/");
    expect(sanitizeOAuthNextPath(null)).toBe("/");
  });
});
