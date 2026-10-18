// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const { requestHeaders, auth, listByUserId } = vi.hoisted(() => {
  const requestHeaders = new Headers();
  const auth = {
    getUser: vi.fn(),
    signInWithPassword: vi.fn(),
  };
  const listByUserId = vi.fn();
  return { requestHeaders, auth, listByUserId };
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

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({})),
}));

vi.mock("@/lib/persistence/hive-gateway", () => ({
  createSupabaseHiveGateway: vi.fn(() => ({
    selectWhere: vi.fn(async () => []),
  })),
}));

vi.mock("@/lib/persistence/supabase-repositories", () => ({
  SupabaseCaseRepository: vi.fn(function MockRepo(this: unknown, _gateway: unknown, userId: string) {
    return {
      listByUserId: (ownerId: string) => listByUserId(ownerId === userId ? ownerId : ""),
    };
  }),
}));

import { GET } from "./route";

const USER_ID = "11111111-1111-4111-8111-111111111111";

const SERVER_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  HIVE_STORAGE_BUCKET: "case-documents",
  HIVE_DISCOVER_PROMPT_VERSION: "discover-v2",
} as const;

describe("GET /api/cases", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SERVER_ENV.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = SERVER_ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVER_ENV.SUPABASE_SERVICE_ROLE_KEY;
    process.env.HIVE_STORAGE_BUCKET = SERVER_ENV.HIVE_STORAGE_BUCKET;
    process.env.HIVE_DISCOVER_PROMPT_VERSION = SERVER_ENV.HIVE_DISCOVER_PROMPT_VERSION;
    auth.getUser.mockReset();
    listByUserId.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns owned hives for the session user", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    listByUserId.mockResolvedValue([
      {
        id: "33333333-3333-4333-8333-333333333333",
        userId: USER_ID,
        domainId: "iep",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    ]);
    const response = await GET();
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      cases: Array<{ caseId: string; workspace: { studyRunId: string | null } }>;
    };
    expect(body.cases).toHaveLength(1);
    expect(body.cases[0]?.caseId).toBe("33333333-3333-4333-8333-333333333333");
    expect(body.cases[0]?.workspace.studyRunId).toBeNull();
    expect(listByUserId).toHaveBeenCalledWith(USER_ID);
  });
});
