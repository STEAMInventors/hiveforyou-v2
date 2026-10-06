import { describe, expect, it } from "vitest";

import { isStudyShadowEnabled } from "./run-study-shadow-steps.js";
import type { WorkerEnv } from "../env.js";

function env(partial: Partial<WorkerEnv>): WorkerEnv {
  return {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "key",
    HIVE_STORAGE_BUCKET: "case-documents",
    HIVE_WORKER_MODE: "connect",
    HIVE_WORKER_SERVE_PORT: 3001,
    ...partial,
  };
}

describe("isStudyShadowEnabled", () => {
  it("defaults to off", () => {
    expect(isStudyShadowEnabled(env({}))).toBe(false);
    expect(isStudyShadowEnabled(env({ HIVE_STUDY_SHADOW: "off" }))).toBe(false);
  });

  it("is on for on/1/true", () => {
    expect(isStudyShadowEnabled(env({ HIVE_STUDY_SHADOW: "on" }))).toBe(true);
    expect(isStudyShadowEnabled(env({ HIVE_STUDY_SHADOW: "1" }))).toBe(true);
    expect(isStudyShadowEnabled(env({ HIVE_STUDY_SHADOW: "true" }))).toBe(true);
  });
});
