// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const { requestHeaders, auth, adminCreateClient } = vi.hoisted(() => {
  const requestHeaders = new Headers();
  const auth = {
    getUser: vi.fn(),
    signInWithPassword: vi.fn(),
  };
  const adminCreateClient = vi.fn(() => ({ auth, schema: vi.fn() }));
  return { requestHeaders, auth, adminCreateClient };
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

vi.mock("@supabase/supabase-js", () => ({
  createClient: adminCreateClient,
}));

import {
  ControlledTestAuthMisconfiguredError,
  createAuthenticatedHiveGateway,
  getAuthenticatedUserId,
} from "./server";

const TEST_OWNER_ID = "test-owner-uuid";

const SERVER_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  HIVE_STORAGE_BUCKET: "case-documents",
  HIVE_DISCOVER_PROMPT_VERSION: "discover-v2",
} as const;

function basic(password: string): string {
  return `Basic ${Buffer.from(`ignored:${password}`, "utf8").toString("base64")}`;
}

describe("getAuthenticatedUserId controlled test mode", () => {
  beforeEach(() => {
    requestHeaders.delete("authorization");
    auth.getUser.mockReset();
    auth.signInWithPassword.mockReset();
    adminCreateClient.mockClear();

    for (const [key, value] of Object.entries(SERVER_ENV)) {
      process.env[key] = value;
    }
    delete process.env.HIVE_PREVIEW_PASSWORD;
    delete process.env.HIVE_PREVIEW_AUTH_EMAIL;
    delete process.env.HIVE_PREVIEW_AUTH_PASSWORD;
    delete process.env.HIVE_CONTROLLED_TEST_MODE;
    delete process.env.HIVE_TEST_OWNER_USER_ID;
    delete process.env.HIVE_DEV_AUTO_AUTH;
  });

  it("returns null when the preview gate password is wrong", async () => {
    process.env.HIVE_PREVIEW_PASSWORD = "gate-secret";
    process.env.HIVE_CONTROLLED_TEST_MODE = "true";
    process.env.HIVE_TEST_OWNER_USER_ID = TEST_OWNER_ID;

    await expect(getAuthenticatedUserId()).resolves.toBeNull();
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("resolves the configured test owner after a valid preview gate", async () => {
    process.env.HIVE_PREVIEW_PASSWORD = "gate-secret";
    process.env.HIVE_CONTROLLED_TEST_MODE = "true";
    process.env.HIVE_TEST_OWNER_USER_ID = TEST_OWNER_ID;
    requestHeaders.set("authorization", basic("gate-secret"));

    await expect(getAuthenticatedUserId()).resolves.toBe(TEST_OWNER_ID);
    expect(auth.getUser).not.toHaveBeenCalled();
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("fail-closes when the test owner or service role is missing", async () => {
    process.env.HIVE_PREVIEW_PASSWORD = "gate-secret";
    process.env.HIVE_CONTROLLED_TEST_MODE = "true";
    requestHeaders.set("authorization", basic("gate-secret"));

    await expect(getAuthenticatedUserId()).rejects.toBeInstanceOf(
      ControlledTestAuthMisconfiguredError,
    );

    process.env.HIVE_TEST_OWNER_USER_ID = TEST_OWNER_ID;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    await expect(getAuthenticatedUserId()).rejects.toBeInstanceOf(
      ControlledTestAuthMisconfiguredError,
    );
  });

  it("keeps normal Supabase session auth when controlled test mode is disabled", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "session-user" } }, error: null });

    await expect(getAuthenticatedUserId()).resolves.toBe("session-user");
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });
});

describe("createAuthenticatedHiveGateway controlled test mode", () => {
  beforeEach(() => {
    for (const [key, value] of Object.entries(SERVER_ENV)) {
      process.env[key] = value;
    }
    delete process.env.HIVE_PREVIEW_PASSWORD;
    delete process.env.HIVE_CONTROLLED_TEST_MODE;
    delete process.env.HIVE_TEST_OWNER_USER_ID;
    adminCreateClient.mockClear();
  });

  it("uses the service-role client when controlled test mode is active", async () => {
    process.env.HIVE_PREVIEW_PASSWORD = "gate-secret";
    process.env.HIVE_CONTROLLED_TEST_MODE = "true";
    process.env.HIVE_TEST_OWNER_USER_ID = TEST_OWNER_ID;

    await createAuthenticatedHiveGateway();

    expect(adminCreateClient).toHaveBeenCalledWith(
      SERVER_ENV.NEXT_PUBLIC_SUPABASE_URL,
      SERVER_ENV.SUPABASE_SERVICE_ROLE_KEY,
      expect.objectContaining({ auth: expect.any(Object) }),
    );
  });
});
