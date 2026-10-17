import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();

vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabaseClient: () => ({
    auth: { getUser },
  }),
}));

import { readClientSessionStatus, resolveWorkflowSessionStatus } from "./client-session";

describe("readClientSessionStatus", () => {
  beforeEach(() => {
    getUser.mockReset();
  });

  it("returns authenticated when Supabase reports a user", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    await expect(readClientSessionStatus()).resolves.toBe("authenticated");
  });

  it("returns unauthenticated when Supabase reports no user", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(readClientSessionStatus()).resolves.toBe("unauthenticated");
  });

  it("returns unauthenticated when getUser fails", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Auth session missing!" },
    });
    await expect(readClientSessionStatus()).resolves.toBe("unauthenticated");
  });

  it("returns error when the session client cannot be read", async () => {
    getUser.mockRejectedValue(new Error("network"));
    await expect(readClientSessionStatus()).resolves.toBe("error");
  });
});

describe("resolveWorkflowSessionStatus", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    getUser.mockReset();
  });

  it("returns authenticated when the server session endpoint succeeds", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "authenticated" }),
    });
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(resolveWorkflowSessionStatus()).resolves.toBe("authenticated");
  });

  it("returns authenticated when dev auto-auth cookies appear after the server probe", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ status: "unauthenticated" }),
    });
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    await expect(resolveWorkflowSessionStatus()).resolves.toBe("authenticated");
  });

  it("returns unauthenticated when neither server nor browser has a session", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ status: "unauthenticated" }),
    });
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(resolveWorkflowSessionStatus()).resolves.toBe("unauthenticated");
  });
});
