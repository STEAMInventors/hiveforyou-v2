import { beforeEach, describe, expect, it, vi } from "vitest";

const { signInWithOAuth } = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabaseClient: () => ({
    auth: { signInWithOAuth },
  }),
}));

import { signInWithGoogle } from "./google-sign-in";

describe("signInWithGoogle", () => {
  beforeEach(() => {
    signInWithOAuth.mockReset();
    signInWithOAuth.mockResolvedValue({ data: {}, error: null });
  });

  it("starts Google OAuth against this app's callback", async () => {
    await signInWithGoogle("/intake/run-1");

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=%2Fintake%2Frun-1`,
        queryParams: { prompt: "select_account" },
      },
    });
  });

  it("does not send an external return path to the callback", async () => {
    await signInWithGoogle("https://evil.example/phish");

    expect(signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "google",
        options: expect.objectContaining({
          redirectTo: `${window.location.origin}/auth/callback?next=%2F`,
        }),
      }),
    );
  });
});
