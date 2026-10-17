import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();

vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabaseClient: () => ({
    auth: { getUser },
  }),
}));

import { readClientSessionStatus } from "./client-session";

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
