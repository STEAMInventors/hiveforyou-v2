// @vitest-environment node

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { auth, createServerClient } = vi.hoisted(() => {
  const auth = {
    getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    signInWithPassword: vi.fn(),
  };
  const createServerClient = vi.fn(() => ({ auth }));
  return { auth, createServerClient };
});

vi.mock("@supabase/ssr", () => ({
  createServerClient,
}));

import { middleware } from "./middleware";

const ENV_KEYS = [
  "HIVE_PREVIEW_PASSWORD",
  "HIVE_PREVIEW_AUTH_EMAIL",
  "HIVE_PREVIEW_AUTH_PASSWORD",
  "HIVE_DEV_AUTO_AUTH",
  "HIVE_ENABLE_DEBUG_ROUTES",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

function basic(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`, "utf8").toString("base64")}`;
}

function request(path: string, authorization?: string): NextRequest {
  const headers = new Headers();
  if (authorization) {
    headers.set("authorization", authorization);
  }
  return new NextRequest(`http://localhost${path}`, { headers });
}

describe("preview password middleware", () => {
  const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

  beforeEach(() => {
    auth.getUser.mockClear();
    auth.signInWithPassword.mockClear();
    createServerClient.mockClear();
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  });

  it("leaves pages and API unchanged when the preview password is unset", async () => {
    for (const path of ["/", "/api/documents/commit"]) {
      const response = await middleware(request(path));
      expect(response.status, path).toBe(200);
      expect(response.headers.get("www-authenticate"), path).toBeNull();
    }
  });

  it("returns 401 when the preview password is missing or wrong", async () => {
    process.env.HIVE_PREVIEW_PASSWORD = "gate-secret";
    for (const path of ["/", "/api/documents/commit"]) {
      const missing = await middleware(request(path));
      expect(missing.status, path).toBe(401);
      expect(missing.headers.get("www-authenticate"), path).toBe(
        'Basic realm="Hive preview", charset="UTF-8"',
      );

      const wrong = await middleware(request(path, basic("anyone", "nope")));
      expect(wrong.status, path).toBe(401);
      expect(wrong.headers.get("www-authenticate"), path).toBe(
        'Basic realm="Hive preview", charset="UTF-8"',
      );
    }
  });

  it("continues the page when the password matches and ignores the username", async () => {
    process.env.HIVE_PREVIEW_PASSWORD = "gate-secret";
    const response = await middleware(request("/", basic("ignored", "gate-secret")));
    expect(response.status).toBe(200);
    expect(response.headers.get("www-authenticate")).toBeNull();
  });

  it("does not create a Supabase session after the preview password matches", async () => {
    process.env.HIVE_PREVIEW_PASSWORD = "gate-secret";
    process.env.HIVE_PREVIEW_AUTH_EMAIL = "preview@example.com";
    process.env.HIVE_PREVIEW_AUTH_PASSWORD = "preview-secret";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

    const response = await middleware(request("/", basic("ignored", "gate-secret")));

    expect(response.status).toBe(200);
    expect(createServerClient).toHaveBeenCalled();
    expect(auth.getUser).toHaveBeenCalled();
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("returns 404 for debug API and pages when debug routes are disabled", async () => {
    for (const path of [
      "/api/case/abc/canonical-debug",
      "/hives/abc/extraction-debug",
    ]) {
      const response = await middleware(request(path));
      expect(response.status, path).toBe(404);
    }
  });
});
