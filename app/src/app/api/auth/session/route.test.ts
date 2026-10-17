import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env/server-env", () => ({
  readServerEnv: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  getAuthenticatedUserId: vi.fn(),
}));

import { readServerEnv } from "@/lib/env/server-env";
import { getAuthenticatedUserId } from "@/lib/supabase/server";

import { GET } from "./route";

describe("GET /api/auth/session", () => {
  beforeEach(() => {
    vi.mocked(readServerEnv).mockReset();
    vi.mocked(getAuthenticatedUserId).mockReset();
    vi.mocked(readServerEnv).mockReturnValue({} as never);
  });

  it("returns authenticated when the server resolves a session user", async () => {
    vi.mocked(getAuthenticatedUserId).mockResolvedValue("user-1");
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "authenticated" });
  });

  it("returns unauthenticated when no session user is available", async () => {
    vi.mocked(getAuthenticatedUserId).mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ status: "unauthenticated" });
  });
});