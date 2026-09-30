import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { publicSupabaseConfig, readServerEnv, readServerEnvPresence } from "./server-env";

const REQUIRED = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  HIVE_STORAGE_BUCKET: "case-documents",
  HIVE_DISCOVER_PROMPT_VERSION: "discover-v1",
};

function walk(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...walk(path));
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".test.ts")) {
      files.push(path);
    }
  }
  return files;
}

describe("server environment", () => {
  it("requires the server variables and keeps the service role off the public config", () => {
    expect(() => readServerEnv({})).toThrow(/Missing required server environment/);
    const env = readServerEnv({
      ...REQUIRED,
      HIVE_CANONICAL_STUDY_ENGINE: "fixture",
    });
    expect(env.HIVE_CANONICAL_STUDY_ENGINE).toBe("fixture");
    expect(publicSupabaseConfig(env)).toEqual({
      url: "https://example.supabase.co",
      anonKey: "anon-key",
    });
    expect(JSON.stringify(publicSupabaseConfig(env))).not.toContain("service-role-key");
  });

  it("reports configuration presence as booleans and omits environment values", () => {
    expect(readServerEnvPresence({})).toEqual({
      supabaseUrlPresent: false,
      anonKeyPresent: false,
      serviceRoleKeyPresent: false,
      storageBucketPresent: false,
      discoverPromptVersionPresent: false,
      discoverPromptVersionIsLatest: false,
    });
    const presence = readServerEnvPresence({
      ...REQUIRED,
      HIVE_DISCOVER_PROMPT_VERSION: "  latest  ",
    });
    expect(presence).toEqual({
      supabaseUrlPresent: true,
      anonKeyPresent: true,
      serviceRoleKeyPresent: true,
      storageBucketPresent: true,
      discoverPromptVersionPresent: true,
      discoverPromptVersionIsLatest: true,
    });
    expect(Object.values(presence).every((value) => typeof value === "boolean")).toBe(true);
    const serialized = JSON.stringify(presence);
    expect(serialized).not.toContain("anon-key");
    expect(serialized).not.toContain("service-role-key");
    expect(serialized).not.toContain("https://example.supabase.co");
  });

  it("rejects an unpinned discover prompt version", () => {
    expect(() =>
      readServerEnv({
        ...REQUIRED,
        HIVE_DISCOVER_PROMPT_VERSION: "latest",
      }),
    ).toThrow(/latest/);
  });

  it("does not reference the service-role key from client modules", () => {
    const root = join(process.cwd(), "src");
    const allowed = new Set([
      "lib/env/server-env.ts",
      "lib/supabase/admin.ts",
    ]);
    const offenders = walk(root).filter((file) => {
      const source = readFileSync(file, "utf8");
      if (!source.includes("SUPABASE_SERVICE_ROLE_KEY")) {
        return false;
      }
      const rel = relative(root, file).replaceAll("\\", "/");
      return !allowed.has(rel);
    });
    expect(offenders).toEqual([]);
    const devSecretOffenders = walk(root).filter((file) => {
      const source = readFileSync(file, "utf8");
      if (!source.includes("HIVE_DEV_AUTH_PASSWORD")) {
        return false;
      }
      const rel = relative(root, file).replaceAll("\\", "/");
      return rel !== "lib/supabase/dev-auto-auth.ts" && !rel.endsWith("dev-auto-auth.test.ts");
    });
    expect(devSecretOffenders).toEqual([]);
    const browser = readFileSync(join(root, "lib/supabase/browser.ts"), "utf8");
    expect(browser).not.toContain("SERVICE_ROLE");
    expect(browser).not.toContain("HIVE_DEV_AUTH");
    const admin = readFileSync(join(root, "lib/supabase/admin.ts"), "utf8");
    expect(admin).toContain('import "server-only"');
  });
});
