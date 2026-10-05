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

const PREVIEW_USER_ID = "preview-user-1";

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

function commitRequest(): Request {
  const boundary = "----hivepreview";
  const body = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="caseId"',
    "",
    "",
    `--${boundary}`,
    'Content-Disposition: form-data; name="stagedDocumentId"',
    "",
    "staged-1",
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="note.txt"',
    "Content-Type: text/plain",
    "",
    "hello",
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return new Request("http://localhost/api/documents/commit", {
    method: "POST",
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    body,
  });
}

describe("POST /api/documents/commit preview auth", () => {
  let signedIn = false;

  beforeEach(() => {
    signedIn = false;
    requestHeaders.delete("authorization");
    vi.mocked(createOrReuseCase).mockClear();
    vi.mocked(persistSourceDocument).mockClear();
    auth.getUser.mockReset();
    auth.signInWithPassword.mockReset();
    auth.getUser.mockImplementation(async () => {
      if (!signedIn) {
        return {
          data: { user: null },
          error: { name: "AuthSessionMissingError", message: "Auth session missing!" },
        };
      }
      return { data: { user: { id: PREVIEW_USER_ID } }, error: null };
    });
    auth.signInWithPassword.mockImplementation(async () => {
      signedIn = true;
      return { data: { session: {} }, error: null };
    });

    for (const [key, value] of Object.entries(SERVER_ENV)) {
      process.env[key] = value;
    }
    delete process.env.HIVE_PREVIEW_PASSWORD;
    delete process.env.HIVE_PREVIEW_AUTH_EMAIL;
    delete process.env.HIVE_PREVIEW_AUTH_PASSWORD;
    delete process.env.HIVE_DEV_AUTO_AUTH;
  });

  it("stays unauthenticated when the preview password is unset", async () => {
    const response = await POST(commitRequest());
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "UNAUTHENTICATED" });
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
    expect(createOrReuseCase).not.toHaveBeenCalled();
  });

  it("does not resolve a user when the preview password is wrong", async () => {
    process.env.HIVE_PREVIEW_PASSWORD = "gate-secret";
    process.env.HIVE_PREVIEW_AUTH_EMAIL = "preview@example.com";
    process.env.HIVE_PREVIEW_AUTH_PASSWORD = "preview-secret";
    const authorization = basic("anyone", "wrong");
    requestHeaders.set("authorization", authorization);

    const response = await POST(commitRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "UNAUTHENTICATED" });
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
    expect(createOrReuseCase).not.toHaveBeenCalled();
  });

  it("resolves the preview user id when the preview password matches", async () => {
    process.env.HIVE_PREVIEW_PASSWORD = "gate-secret";
    process.env.HIVE_PREVIEW_AUTH_EMAIL = "preview@example.com";
    process.env.HIVE_PREVIEW_AUTH_PASSWORD = "preview-secret";
    const authorization = basic("ignored", "gate-secret");
    requestHeaders.set("authorization", authorization);

    const response = await POST(commitRequest());

    expect(response.status).toBe(200);
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: "preview@example.com",
      password: "preview-secret",
    });
    expect(createOrReuseCase).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sessionUserId: PREVIEW_USER_ID }),
    );
    expect(persistSourceDocument).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: PREVIEW_USER_ID }),
    );
  });
});
