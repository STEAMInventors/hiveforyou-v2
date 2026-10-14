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

vi.mock("@/lib/persistence/hive-gateway", () => ({
  createSupabaseHiveGateway: vi.fn(() => ({})),
}));

vi.mock("@hiveforyou/core", () => ({
  createOrReuseCase: vi.fn(async () => ({ id: "case-1" })),
  persistSourceDocument: vi.fn(async () => ({ id: "source-1" })),
  UnauthenticatedError: class UnauthenticatedError extends Error {
    constructor() {
      super("unauthenticated");
      this.name = "UnauthenticatedError";
    }
  },
}));

import { createOrReuseCase, persistSourceDocument } from "@hiveforyou/core";

import { POST } from "./route";

const USER_A = "user-a-session";
const USER_B = "user-b-session";

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

function commitRequest(fields?: { userId?: string }): Request {
  const boundary = "----hivepreview";
  const lines = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="caseId"',
    "",
    "",
    `--${boundary}`,
    'Content-Disposition: form-data; name="stagedDocumentId"',
    "",
    "staged-1",
  ];
  if (fields?.userId) {
    lines.push(
      `--${boundary}`,
      'Content-Disposition: form-data; name="userId"',
      "",
      fields.userId,
    );
  }
  lines.push(
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="note.txt"',
    "Content-Type: text/plain",
    "",
    "hello",
    `--${boundary}--`,
    "",
  );
  return new Request("http://localhost/api/documents/commit", {
    method: "POST",
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    body: lines.join("\r\n"),
  });
}

describe("POST /api/documents/commit session auth", () => {
  let sessionUserId: string | null = null;

  beforeEach(() => {
    sessionUserId = null;
    requestHeaders.delete("authorization");
    vi.mocked(createOrReuseCase).mockClear();
    vi.mocked(persistSourceDocument).mockClear();
    auth.getUser.mockReset();
    auth.signInWithPassword.mockReset();
    auth.getUser.mockImplementation(async () => {
      if (!sessionUserId) {
        return {
          data: { user: null },
          error: { name: "AuthSessionMissingError", message: "Auth session missing!" },
        };
      }
      return { data: { user: { id: sessionUserId } }, error: null };
    });

    for (const [key, value] of Object.entries(SERVER_ENV)) {
      process.env[key] = value;
    }
    delete process.env.HIVE_PREVIEW_PASSWORD;
    delete process.env.HIVE_PREVIEW_AUTH_EMAIL;
    delete process.env.HIVE_PREVIEW_AUTH_PASSWORD;
    delete process.env.HIVE_DEV_AUTO_AUTH;
    delete process.env.VERCEL_ENV;
  });

  it("rejects an upload when there is no Supabase session", async () => {
    const response = await POST(commitRequest());
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "UNAUTHENTICATED" });
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
    expect(createOrReuseCase).not.toHaveBeenCalled();
    expect(persistSourceDocument).not.toHaveBeenCalled();
  });

  it("rejects an upload when the preview password matches but there is no Supabase session", async () => {
    process.env.HIVE_PREVIEW_PASSWORD = "gate-secret";
    process.env.HIVE_PREVIEW_AUTH_EMAIL = "preview@example.com";
    process.env.HIVE_PREVIEW_AUTH_PASSWORD = "preview-secret";
    requestHeaders.set("authorization", basic("anyone", "gate-secret"));

    const response = await POST(commitRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "UNAUTHENTICATED" });
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
    expect(createOrReuseCase).not.toHaveBeenCalled();
    expect(persistSourceDocument).not.toHaveBeenCalled();
  });

  it("authorizes an upload as the signed-in Supabase user", async () => {
    sessionUserId = USER_A;

    const response = await POST(commitRequest());

    expect(response.status).toBe(200);
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
    expect(createOrReuseCase).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sessionUserId: USER_A }),
    );
    expect(persistSourceDocument).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: USER_A }),
    );
  });

  it("keeps each signed-in user on their own document ownership", async () => {
    sessionUserId = USER_A;
    await POST(commitRequest());

    sessionUserId = USER_B;
    const response = await POST(commitRequest({ userId: USER_A }));

    expect(response.status).toBe(200);
    expect(persistSourceDocument).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: USER_B }),
    );
    expect(createOrReuseCase).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ sessionUserId: USER_B }),
    );
    const persistedUserIds = vi.mocked(persistSourceDocument).mock.calls.map((call) => {
      const input = call[1] as { userId?: string };
      return input.userId;
    });
    expect(persistedUserIds).toEqual([USER_A, USER_B]);
  });
});
