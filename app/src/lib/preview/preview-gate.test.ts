import { describe, expect, it } from "vitest";

import {
  authorizationMatchesPreviewPassword,
  constantTimeEqual,
  isHiveDebugApiPath,
  isHiveDebugPagePath,
  assertAuthBypassDisabledInProduction,
  AuthBypassRefusedInProductionError,
  isHiveAdminUserId,
  isHiveDebugRoutesEnabled,
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

  it("enables debug routes only when HIVE_ENABLE_DEBUG_ROUTES is true", () => {
    expect(isHiveDebugRoutesEnabled({})).toBe(false);
    expect(isHiveDebugRoutesEnabled({ HIVE_ENABLE_DEBUG_ROUTES: "true" })).toBe(true);
  });

  it("recognizes debug API and page paths", () => {
    expect(isHiveDebugApiPath("/api/case/abc/canonical-debug")).toBe(true);
    expect(isHiveDebugApiPath("/api/case/abc/bundle")).toBe(false);
    expect(isHiveDebugPagePath("/hives/abc/extraction-debug")).toBe(true);
  });

  it("refuses auth bypass env configuration on Vercel production", () => {
    expect(() =>
      assertAuthBypassDisabledInProduction({
        VERCEL_ENV: "production",
        HIVE_DEV_AUTO_AUTH: "true",
      }),
    ).toThrow(AuthBypassRefusedInProductionError);
    expect(() =>
      assertAuthBypassDisabledInProduction({
        VERCEL_ENV: "preview",
        HIVE_PREVIEW_PASSWORD: "gate",
      }),
    ).not.toThrow();
  });

  it("resolves admin user ids from HIVE_ADMIN_USER_IDS", () => {
    expect(isHiveAdminUserId("admin-1", { HIVE_ADMIN_USER_IDS: "admin-1, admin-2" })).toBe(
      true,
    );
    expect(isHiveAdminUserId("other", { HIVE_ADMIN_USER_IDS: "admin-1" })).toBe(false);
  });
});
