import { describe, expect, it } from "vitest";

import {
  authorizationMatchesPreviewPassword,
  constantTimeEqual,
  isPreviewPasswordGateEnabled,
  readBasicAuthPassword,
} from "./preview-gate";

function basic(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`, "utf8").toString("base64")}`;
}

describe("preview password gate", () => {
  it("is disabled when the password is unset or blank", () => {
    expect(isPreviewPasswordGateEnabled({})).toBe(false);
    expect(isPreviewPasswordGateEnabled({ HIVE_PREVIEW_PASSWORD: "   " })).toBe(false);
    expect(isPreviewPasswordGateEnabled({ HIVE_PREVIEW_PASSWORD: " gate " })).toBe(true);
  });

  it("reads the basic password and ignores the username", () => {
    expect(readBasicAuthPassword(null)).toBeNull();
    expect(readBasicAuthPassword("Bearer token")).toBeNull();
    expect(readBasicAuthPassword(basic("anyone", "secret"))).toBe("secret");
    expect(readBasicAuthPassword(basic("", "secret"))).toBe("secret");
    expect(readBasicAuthPassword(basic("user", "pass:word"))).toBe("pass:word");
  });

  it("compares passwords without treating a shared prefix as a match", () => {
    expect(constantTimeEqual("secret", "secret")).toBe(true);
    expect(constantTimeEqual("secret", "secret!")).toBe(false);
    expect(constantTimeEqual("secret", "secre")).toBe(false);
    expect(constantTimeEqual("a", "b")).toBe(false);
  });

  it("matches only the configured password", () => {
    const source = { HIVE_PREVIEW_PASSWORD: " gate-secret " };
    expect(authorizationMatchesPreviewPassword(basic("ignored", "gate-secret"), source)).toBe(
      true,
    );
    expect(authorizationMatchesPreviewPassword(basic("other", "wrong"), source)).toBe(false);
    expect(authorizationMatchesPreviewPassword(null, source)).toBe(false);
    expect(authorizationMatchesPreviewPassword(basic("ignored", "gate-secret"), {})).toBe(false);
  });
});
