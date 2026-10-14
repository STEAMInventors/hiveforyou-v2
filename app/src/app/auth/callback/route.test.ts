// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const { exchangeCodeForSession, signInWithPassword, createServerSupabaseClient } = vi.hoisted(
  () => {
    const exchangeCodeForSession = vi.fn();
    const signInWithPassword = vi.fn();
    const createServerSupabaseClient = vi.fn(async () => ({
      auth: { exchangeCodeForSession, signInWithPassword },
    }));
    return { exchangeCodeForSession, signInWithPassword, createServerSupabaseClient };
  },
);

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient,
}));

import { GET } from "./route";

describe("GET /auth/callback", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
    signInWithPassword.mockReset();
    createServerSupabaseClient.mockClear();
  });

  it("exchanges the OAuth code and returns to the in-app path", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: "google-user-1" } } },
      error: null,
    });

    const response = await GET(
      new Request("http://localhost/auth/callback?code=auth-code&next=%2Fintake%2Frun-1"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/intake/run-1");
    expect(exchangeCodeForSession).toHaveBeenCalledWith("auth-code");
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("rejects a missing code without creating a session", async () => {
    const response = await GET(new Request("http://localhost/auth/callback"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/?auth=error");
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("returns home when the code exchange fails and does not echo the provider error", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { session: null },
      error: { message: "bad code secret-detail" },
    });

    const response = await GET(
      new Request("http://localhost/auth/callback?code=expired&next=https://evil.example"),
    );

    expect(response.headers.get("location")).toBe("http://localhost/?auth=error");
    expect(response.headers.get("location")).not.toContain("secret-detail");
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("returns a successful sign-in to the app root when next is not an in-app path", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: "google-user-1" } } },
      error: null,
    });

    const response = await GET(
      new Request("http://localhost/auth/callback?code=auth-code&next=https://evil.example/phish"),
    );

    expect(response.headers.get("location")).toBe("http://localhost/");
    expect(exchangeCodeForSession).toHaveBeenCalledWith("auth-code");
  });
});
