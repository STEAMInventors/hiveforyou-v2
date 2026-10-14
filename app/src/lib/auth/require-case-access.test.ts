import { beforeEach, describe, expect, it, vi } from "vitest";

import { UnauthenticatedError } from "@hiveforyou/core";

vi.mock("@/lib/supabase/server", () => ({
  getAuthenticatedUserId: vi.fn(),
  createServerSupabaseClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn(),
}));

vi.mock("@/lib/persistence/hive-gateway", () => ({
  createSupabaseHiveGateway: vi.fn(() => ({})),
}));

vi.mock("@/lib/persistence/supabase-repositories", () => ({
  SupabaseCaseRepository: vi.fn(),
}));

import { getAuthenticatedUserId } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { SupabaseCaseRepository } from "@/lib/persistence/supabase-repositories";
import { createSupabaseHiveGateway } from "@/lib/persistence/hive-gateway";

import { AuthBypassRefusedInProductionError } from "@/lib/preview/preview-gate";

import {
  CaseAccessNotFoundError,
  ForbiddenError,
  jsonFromAccessError,
  requireAdmin,
  requireCaseAccess,
  requireUser,
} from "./require-case-access";

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CASE_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("require-case-access", () => {
  beforeEach(() => {
    vi.mocked(getAuthenticatedUserId).mockReset();
    vi.mocked(createAdminSupabaseClient).mockReset();
    vi.mocked(createSupabaseHiveGateway).mockReset();
    vi.mocked(SupabaseCaseRepository).mockReset();
    delete process.env.HIVE_ADMIN_USER_IDS;
    delete process.env.VERCEL_ENV;
    delete process.env.HIVE_DEV_AUTO_AUTH;
    delete process.env.HIVE_PREVIEW_PASSWORD;
  });

  it("requireUser throws when there is no session", async () => {
    vi.mocked(getAuthenticatedUserId).mockResolvedValue(null);
    await expect(requireUser(new Request("http://localhost"))).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });

  it("requireAdmin rejects non-admin users", async () => {
    vi.mocked(getAuthenticatedUserId).mockResolvedValue(USER_A);
    process.env.HIVE_ADMIN_USER_IDS = USER_B;
    await expect(requireAdmin(new Request("http://localhost"))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("requireCaseAccess returns owned case", async () => {
    vi.mocked(getAuthenticatedUserId).mockResolvedValue(USER_A);
    vi.mocked(SupabaseCaseRepository).mockImplementation(
      () =>
        ({
          getById: vi.fn().mockResolvedValue({
            id: CASE_A,
            userId: USER_A,
            domainId: null,
            createdAt: "t",
            updatedAt: "t",
          }),
        }) as never,
    );

    const result = await requireCaseAccess(new Request("http://localhost"), CASE_A);
    expect(result.case.id).toBe(CASE_A);
  });

  it("requireCaseAccess returns 403 when case exists but user is not owner", async () => {
    vi.mocked(getAuthenticatedUserId).mockResolvedValue(USER_B);
    vi.mocked(SupabaseCaseRepository).mockImplementation(
      () =>
        ({
          getById: vi.fn().mockResolvedValue(null),
        }) as never,
    );
    vi.mocked(createSupabaseHiveGateway).mockReturnValue({
      selectWhere: vi.fn().mockResolvedValue([{ id: CASE_A, user_id: USER_A }]),
    } as never);

    await expect(requireCaseAccess(new Request("http://localhost"), CASE_A)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("requireCaseAccess returns 404 for unknown case id", async () => {
    vi.mocked(getAuthenticatedUserId).mockResolvedValue(USER_A);
    vi.mocked(SupabaseCaseRepository).mockImplementation(
      () =>
        ({
          getById: vi.fn().mockResolvedValue(null),
        }) as never,
    );
    vi.mocked(createSupabaseHiveGateway).mockReturnValue({
      selectWhere: vi.fn().mockResolvedValue([]),
    } as never);

    await expect(requireCaseAccess(new Request("http://localhost"), CASE_A)).rejects.toBeInstanceOf(
      CaseAccessNotFoundError,
    );
  });

  it("refuses HIVE_DEV_AUTO_AUTH on production", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.HIVE_DEV_AUTO_AUTH = "true";
    await expect(requireUser(new Request("http://localhost"))).rejects.toBeInstanceOf(
      AuthBypassRefusedInProductionError,
    );
  });

  it("allows the preview password gate on production", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.HIVE_PREVIEW_PASSWORD = "gate";
    vi.mocked(getAuthenticatedUserId).mockResolvedValue(USER_A);
    await expect(requireUser(new Request("http://localhost"))).resolves.toEqual({
      user: { id: USER_A },
    });
  });

  it("maps auth bypass refusal to 503 JSON", () => {
    const response = jsonFromAccessError(new AuthBypassRefusedInProductionError());
    expect(response?.status).toBe(503);
  });
});
