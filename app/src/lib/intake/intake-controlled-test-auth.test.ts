// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  getAuthenticatedUserId: vi.fn(),
  createAuthenticatedHiveGateway: vi.fn(),
}));

vi.mock("@/lib/env/server-env", () => ({
  readServerEnv: vi.fn(() => ({
    HIVE_STORAGE_BUCKET: "case-documents",
  })),
}));

import { createAuthenticatedHiveGateway, getAuthenticatedUserId } from "@/lib/supabase/server";
import {
  SupabaseCaseRepository,
  SupabaseStudyRunRepository,
} from "@/lib/persistence/supabase-repositories";

const TEST_OWNER_ID = "test-owner-uuid";

describe("intake persistence owner", () => {
  beforeEach(() => {
    vi.mocked(getAuthenticatedUserId).mockReset();
    vi.mocked(createAuthenticatedHiveGateway).mockReset();
  });

  it("loads study runs scoped to the configured test owner", async () => {
    vi.mocked(getAuthenticatedUserId).mockResolvedValue(TEST_OWNER_ID);
    const selectWhere = vi.fn(async () => []);
    vi.mocked(createAuthenticatedHiveGateway).mockResolvedValue({ selectWhere } as never);

    const gateway = await createAuthenticatedHiveGateway();
    const runs = new SupabaseStudyRunRepository(gateway, TEST_OWNER_ID);
    await runs.getByStudyRunId("study-run-1");

    expect(selectWhere).toHaveBeenCalledWith(
      "study_runs",
      { id: "study-run-1", user_id: TEST_OWNER_ID },
      { limit: 1 },
    );
  });

  it("scopes case lookup to the configured test owner", async () => {
    vi.mocked(getAuthenticatedUserId).mockResolvedValue(TEST_OWNER_ID);
    const selectWhere = vi.fn(async () => [
      { id: "case-1", user_id: TEST_OWNER_ID, domain_id: null, created_at: "t", updated_at: "t" },
    ]);
    vi.mocked(createAuthenticatedHiveGateway).mockResolvedValue({ selectWhere } as never);

    const gateway = await createAuthenticatedHiveGateway();
    const cases = new SupabaseCaseRepository(gateway, TEST_OWNER_ID);
    const owned = await cases.getById(TEST_OWNER_ID, "case-1");

    expect(owned?.userId).toBe(TEST_OWNER_ID);
    expect(selectWhere).toHaveBeenCalledWith(
      "cases",
      { id: "case-1", user_id: TEST_OWNER_ID },
      expect.objectContaining({ limit: 1 }),
    );
  });
});
