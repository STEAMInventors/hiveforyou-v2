import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { ensureDevSupabaseSession } from "./dev-auto-auth";

function mockSupabase() {
  const getUser = vi.fn();
  const signInWithPassword = vi.fn();
  return {
    client: {
      auth: { getUser, signInWithPassword },
    },
    getUser,
    signInWithPassword,
  };
}

describe("ensureDevSupabaseSession", () => {
  beforeEach(() => {
    delete process.env.HIVE_DEV_AUTO_AUTH;
    delete process.env.HIVE_DEV_AUTH_EMAIL;
    delete process.env.HIVE_DEV_AUTH_PASSWORD;
    delete process.env.HIVE_PREVIEW_PASSWORD;
    delete process.env.HIVE_PREVIEW_AUTH_EMAIL;
    delete process.env.HIVE_PREVIEW_AUTH_PASSWORD;
    delete process.env.VERCEL;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("does nothing on Vercel even in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL", "1");
    process.env.HIVE_DEV_AUTO_AUTH = "1";
    process.env.HIVE_DEV_AUTH_EMAIL = "dev@example.com";
    process.env.HIVE_DEV_AUTH_PASSWORD = "secret";
    const { client, getUser, signInWithPassword } = mockSupabase();

    await ensureDevSupabaseSession(client as never);

    expect(getUser).not.toHaveBeenCalled();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("does nothing without explicit opt-in", async () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.HIVE_DEV_AUTH_EMAIL = "dev@example.com";
    process.env.HIVE_DEV_AUTH_PASSWORD = "secret";
    const { client, getUser, signInWithPassword } = mockSupabase();

    await ensureDevSupabaseSession(client as never);

    expect(getUser).not.toHaveBeenCalled();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("does nothing outside development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.HIVE_DEV_AUTO_AUTH = "1";
    process.env.HIVE_DEV_AUTH_EMAIL = "dev@example.com";
    process.env.HIVE_DEV_AUTH_PASSWORD = "secret";
    const { client, getUser, signInWithPassword } = mockSupabase();

    await ensureDevSupabaseSession(client as never);

    expect(getUser).not.toHaveBeenCalled();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("does nothing in test environment", async () => {
    vi.stubEnv("NODE_ENV", "test");
    process.env.HIVE_DEV_AUTO_AUTH = "1";
    process.env.HIVE_DEV_AUTH_EMAIL = "dev@example.com";
    process.env.HIVE_DEV_AUTH_PASSWORD = "secret";
    const { client, getUser, signInWithPassword } = mockSupabase();

    await ensureDevSupabaseSession(client as never);

    expect(getUser).not.toHaveBeenCalled();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("skips sign-in when dev credentials are missing", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { client, getUser, signInWithPassword } = mockSupabase();

    await ensureDevSupabaseSession(client as never);

    expect(getUser).not.toHaveBeenCalled();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("skips sign-in when a session already exists", async () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.HIVE_DEV_AUTO_AUTH = "1";
    process.env.HIVE_DEV_AUTH_EMAIL = "dev@example.com";
    process.env.HIVE_DEV_AUTH_PASSWORD = "secret";
    const { client, getUser, signInWithPassword } = mockSupabase();
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });

    await ensureDevSupabaseSession(client as never);

    expect(getUser).toHaveBeenCalledTimes(1);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("signs in with password when development credentials are set and there is no user", async () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.HIVE_DEV_AUTO_AUTH = "1";
    process.env.HIVE_DEV_AUTH_EMAIL = " dev@example.com ";
    process.env.HIVE_DEV_AUTH_PASSWORD = " secret ";
    const { client, getUser, signInWithPassword } = mockSupabase();
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    signInWithPassword.mockResolvedValue({ data: { session: {} }, error: null });

    await ensureDevSupabaseSession(client as never);

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "dev@example.com",
      password: "secret",
    });
  });

  it("signs in when getUser reports Auth session missing", async () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.HIVE_DEV_AUTO_AUTH = "1";
    process.env.HIVE_DEV_AUTH_EMAIL = "dev@example.com";
    process.env.HIVE_DEV_AUTH_PASSWORD = "secret";
    const { client, getUser, signInWithPassword } = mockSupabase();
    getUser.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthSessionMissingError", message: "Auth session missing!" },
    });
    signInWithPassword.mockResolvedValue({ data: { session: {} }, error: null });

    await ensureDevSupabaseSession(client as never);

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "dev@example.com",
      password: "secret",
    });
  });

  it("does not sign in when getUser fails with an unexpected auth error", async () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.HIVE_DEV_AUTO_AUTH = "1";
    process.env.HIVE_DEV_AUTH_EMAIL = "dev@example.com";
    process.env.HIVE_DEV_AUTH_PASSWORD = "secret";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client, getUser, signInWithPassword } = mockSupabase();
    getUser.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthApiError", message: "Invalid JWT" },
    });

    await ensureDevSupabaseSession(client as never);

    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith("[dev-auto-auth] getUser failed", {
      message: "Invalid JWT",
    });
  });

  it("signs in the preview user on Vercel when the preview password is set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "1");
    process.env.HIVE_PREVIEW_PASSWORD = "gate";
    process.env.HIVE_PREVIEW_AUTH_EMAIL = " preview@example.com ";
    process.env.HIVE_PREVIEW_AUTH_PASSWORD = " preview-secret ";
    process.env.HIVE_DEV_AUTO_AUTH = "1";
    process.env.HIVE_DEV_AUTH_EMAIL = "dev@example.com";
    process.env.HIVE_DEV_AUTH_PASSWORD = "secret";
    const { client, getUser, signInWithPassword } = mockSupabase();
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    signInWithPassword.mockResolvedValue({ data: { session: {} }, error: null });

    await ensureDevSupabaseSession(client as never);

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "preview@example.com",
      password: "preview-secret",
    });
  });

  it("does not fall back to dev credentials when preview user credentials are missing", async () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.HIVE_PREVIEW_PASSWORD = "gate";
    process.env.HIVE_DEV_AUTO_AUTH = "1";
    process.env.HIVE_DEV_AUTH_EMAIL = "dev@example.com";
    process.env.HIVE_DEV_AUTH_PASSWORD = "secret";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client, signInWithPassword } = mockSupabase();

    await ensureDevSupabaseSession(client as never);

    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith("[preview-auth] preview user credentials are not set");
  });
});
