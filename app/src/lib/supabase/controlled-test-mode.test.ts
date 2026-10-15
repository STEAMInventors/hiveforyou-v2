import { describe, expect, it } from "vitest";

import {
  isControlledTestModeEnabled,
  readControlledTestOwnerUserId,
  requireControlledTestOwnerUserId,
  usesControlledTestAuthentication,
} from "./controlled-test-mode";

describe("controlled test mode", () => {
  it("is disabled by default", () => {
    expect(isControlledTestModeEnabled({})).toBe(false);
    expect(isControlledTestModeEnabled({ HIVE_PREVIEW_PASSWORD: "gate" })).toBe(false);
  });

  it("enables only with an explicit true flag", () => {
    expect(isControlledTestModeEnabled({ HIVE_CONTROLLED_TEST_MODE: "true" })).toBe(true);
    expect(isControlledTestModeEnabled({ HIVE_CONTROLLED_TEST_MODE: "1" })).toBe(true);
    expect(isControlledTestModeEnabled({ HIVE_CONTROLLED_TEST_MODE: "yes" })).toBe(false);
  });

  it("requires preview gate and flag for controlled test authentication", () => {
    expect(
      usesControlledTestAuthentication({
        HIVE_CONTROLLED_TEST_MODE: "true",
        HIVE_PREVIEW_PASSWORD: "gate",
      }),
    ).toBe(true);
    expect(
      usesControlledTestAuthentication({
        HIVE_CONTROLLED_TEST_MODE: "true",
      }),
    ).toBe(false);
    expect(
      usesControlledTestAuthentication({
        HIVE_PREVIEW_PASSWORD: "gate",
      }),
    ).toBe(false);
  });

  it("reads the configured test owner id", () => {
    expect(
      readControlledTestOwnerUserId({ HIVE_TEST_OWNER_USER_ID: "  owner-uuid  " }),
    ).toBe("owner-uuid");
  });

  it("fail-closes when owner or service role is missing", () => {
    expect(() =>
      requireControlledTestOwnerUserId({
        HIVE_CONTROLLED_TEST_MODE: "true",
        HIVE_PREVIEW_PASSWORD: "gate",
      }),
    ).toThrow(/HIVE_TEST_OWNER_USER_ID/);

    expect(() =>
      requireControlledTestOwnerUserId({
        HIVE_CONTROLLED_TEST_MODE: "true",
        HIVE_PREVIEW_PASSWORD: "gate",
        HIVE_TEST_OWNER_USER_ID: "owner-uuid",
      }),
    ).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);

    expect(
      requireControlledTestOwnerUserId({
        HIVE_CONTROLLED_TEST_MODE: "true",
        HIVE_PREVIEW_PASSWORD: "gate",
        HIVE_TEST_OWNER_USER_ID: "owner-uuid",
        SUPABASE_SERVICE_ROLE_KEY: "service-key",
      }),
    ).toBe("owner-uuid");
  });
});
