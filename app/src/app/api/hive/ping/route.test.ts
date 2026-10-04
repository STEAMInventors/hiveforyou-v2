import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  getAuthenticatedUserId: vi.fn(),
}));

vi.mock("@/lib/env/server-env", () => ({
  readServerEnv: vi.fn(),
}));

import { POST } from "./route";
import { inngest } from "@/lib/inngest/client";
import { getAuthenticatedUserId } from "@/lib/supabase/server";
import { HIVE_EVENT_PING } from "@hiveforyou/shared/events";

describe("POST /api/hive/ping", () => {
  beforeEach(() => {
    vi.mocked(inngest.send).mockReset();
    vi.mocked(getAuthenticatedUserId).mockReset();
    vi.mocked(inngest.send).mockResolvedValue({ ids: ["evt-1"] });
  });

  it("sends hive/ping with session userId and ignores body userId", async () => {
    vi.mocked(getAuthenticatedUserId).mockResolvedValue("session-user-abc");

    const response = await POST(
      new Request("http://localhost/api/hive/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "attacker-user" }),
      }),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as { eventId: string };
    expect(json.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    expect(inngest.send).toHaveBeenCalledTimes(1);
    expect(inngest.send).toHaveBeenCalledWith({
      id: json.eventId,
      name: HIVE_EVENT_PING,
      data: {
        userId: "session-user-abc",
        nonce: expect.any(String),
      },
    });
  });
});
