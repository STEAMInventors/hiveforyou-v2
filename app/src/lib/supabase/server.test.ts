// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const { requestHeaders, auth } = vi.hoisted(() => {
  const requestHeaders = new Headers();
  const auth = {
    getUser: vi.fn(),
    signInWithPassword: vi.fn(),
  };
  return { requestHeaders, auth };
});

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    getAll: () => [],
    set: () => undefined,
  })),
  headers: vi.fn(async () => requestHeaders),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({ auth })),
}));

import { getAuthenticatedUserId } from "./server";

const SESSION_USER_ID = "session-user-from-cookie";

const SERVER_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  HIVE_STORAGE_BUCKET: "case-documents",
  HIVE_DISCOVER_PROMPT_VERSION: "discover-v2",
} as const;

function basic(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`, "utf8").toString("base64")}`;
}

describe("getAuthenticatedUserId (SEC-01d session auth)", () => {
  beforeEach(() => {
    requestHeaders.delete("authorization");
    auth.getUser.mockReset();
    auth.signInWithPassword.mockReset();
    auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthSessionMissingError", message: "Auth session missing!" },
    });

    for (const [key, value] of Object.entries(SERVER_ENV)) {
      process.env[key] = value;
    }
    delete process.env.HIVE_PREVIEW_PASSWORD;
    delete process.env.HIVE_PREVIEW_AUTH_EMAIL;
    delete process.env.HIVE_PREVIEW_AUTH_PASSWORD;
    delete process.env.HIVE_DEV_AUTO_AUTH;
    delete process.env.HIVE_DEV_AUTH_EMAIL;
    delete process.env.HIVE_DEV_AUTH_PASSWORD;
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL;
  });

  it("returns the session user when cookies hold a valid session and Authorization is absent", async () => {
    process.env.HIVE_PREVIEW_PASSWORD = "gate-secret";
    auth.getUser.mockResolvedValue({
      data: { user: { id: SESSION_USER_ID } },
      error: null,
    });

    const userId = await getAuthenticatedUserId();

    expect(userId).toBe(SESSION_USER_ID);
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("returns null when there is no session and preview gate credentials are missing on the route", async () => {
    process.env.HIVE_PREVIEW_PASSWORD = "gate-secret";
    process.env.HIVE_PREVIEW_AUTH_EMAIL = "preview@example.com";
    process.env.HIVE_PREVIEW_AUTH_PASSWORD = "preview-secret";

    const userId = await getAuthenticatedUserId();

    expect(userId).toBeNull();
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("returns null when preview gate is enabled but Basic credentials on the route are wrong", async () => {
    process.env.HIVE_PREVIEW_PASSWORD = "gate-secret";
    process.env.HIVE_PREVIEW_AUTH_EMAIL = "preview@example.com";
    process.env.HIVE_PREVIEW_AUTH_PASSWORD = "preview-secret";
    requestHeaders.set("authorization", basic("anyone", "wrong"));

    const userId = await getAuthenticatedUserId();

    expect(userId).toBeNull();
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("returns null when the preview password matches but there is no Supabase session", async () => {
    process.env.HIVE_PREVIEW_PASSWORD = "gate-secret";
    process.env.HIVE_PREVIEW_AUTH_EMAIL = "preview@example.com";
    process.env.HIVE_PREVIEW_AUTH_PASSWORD = "preview-secret";
    requestHeaders.set("authorization", basic("ignored", "gate-secret"));

    const userId = await getAuthenticatedUserId();

    expect(userId).toBeNull();
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("returns null when there is no session and preview gate is disabled", async () => {
    const userId = await getAuthenticatedUserId();

    expect(userId).toBeNull();
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("refuses HIVE_DEV_AUTO_AUTH on Vercel production before resolving a user", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.HIVE_DEV_AUTO_AUTH = "true";

    await expect(getAuthenticatedUserId()).rejects.toThrow(
      "Auth bypass configuration is not allowed in production.",
    );
    expect(auth.getUser).not.toHaveBeenCalled();
  });
});