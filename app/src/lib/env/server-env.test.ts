import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  listServerEnvConfigurationIssues,
  publicSupabaseConfig,
  readJevClassifierConfig,
  readServerEnv,
  readServerEnvPresence,
  readServerRequiredEnvDiagnostics,
  SERVER_REQUIRED_ENV_KEYS,
} from "./server-env";
import { logServerMisconfigured, serverMisconfiguredResponse } from "./server-misconfigured";

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
  it("lists missing required server env names without values", () => {
    expect(listServerEnvConfigurationIssues({})).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "HIVE_STORAGE_BUCKET",
      "HIVE_DISCOVER_PROMPT_VERSION",
    ]);
    const response = serverMisconfiguredResponse({ NODE_ENV: "development" });
    expect(response.status).toBe(503);
    return response.json().then((body) => {
      expect(body.error).toBe("SERVER_MISCONFIGURED");
      expect(body.missing).toEqual(listServerEnvConfigurationIssues({}));
      expect(JSON.stringify(body)).not.toMatch(/service-role|sk-|sb_secret/i);
    });
  });

  it("does not expose missing env names on Vercel production", async () => {
    const response = serverMisconfiguredResponse({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
    });
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toBe("SERVER_MISCONFIGURED");
    expect(body.missing).toBeUndefined();
    expect(Object.keys(body).sort()).toEqual(["error", "message"]);
  });

  it("reports required env diagnostics without leaking values", () => {
    const source = {
      ...REQUIRED,
      SUPABASE_SERVICE_ROLE_KEY: "  sb_secret_should_not_leak  ",
      VERCEL_ENV: " production ",
      VERCEL_DEPLOYMENT_ID: " dpl_test123 ",
    };
    const diagnostics = readServerRequiredEnvDiagnostics(source);
    for (const key of SERVER_REQUIRED_ENV_KEYS) {
      expect(diagnostics[key]).toEqual({
        present: true,
        nonEmptyAfterTrim: true,
      });
    }
    expect(readServerRequiredEnvDiagnostics({}).SUPABASE_SERVICE_ROLE_KEY).toEqual({
      present: false,
      nonEmptyAfterTrim: false,
    });
    expect(readServerRequiredEnvDiagnostics({ SUPABASE_SERVICE_ROLE_KEY: "   " })).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: { present: false, nonEmptyAfterTrim: false },
      NEXT_PUBLIC_SUPABASE_ANON_KEY: { present: false, nonEmptyAfterTrim: false },
      SUPABASE_SERVICE_ROLE_KEY: { present: true, nonEmptyAfterTrim: false },
      HIVE_STORAGE_BUCKET: { present: false, nonEmptyAfterTrim: false },
      HIVE_DISCOVER_PROMPT_VERSION: { present: false, nonEmptyAfterTrim: false },
    });
    const serialized = JSON.stringify(diagnostics);
    expect(serialized).not.toContain("sb_secret");
    expect(serialized).not.toContain("anon-key");
    expect(serialized).not.toContain("service-role-key");
    expect(serialized).not.toContain("https://example");
  });

  it("logs SERVER_MISCONFIGURED with per-key diagnostics and deployment metadata only", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const source = {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-leak-test",
      HIVE_STORAGE_BUCKET: "case-documents",
      HIVE_DISCOVER_PROMPT_VERSION: "discover-v1",
      VERCEL_ENV: "production",
      VERCEL_DEPLOYMENT_ID: "dpl_abc123",
    };
    logServerMisconfigured(listServerEnvConfigurationIssues(source), source);
    expect(errorSpy).toHaveBeenCalledOnce();
    const [label, payload] = errorSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(label).toBe("[server] SERVER_MISCONFIGURED");
    expect(payload.missing).toEqual(["SUPABASE_SERVICE_ROLE_KEY"]);
    expect(payload.VERCEL_ENV).toBe("production");
    expect(payload.VERCEL_DEPLOYMENT_ID).toBe("dpl_abc123");
    expect(payload.required).toEqual(readServerRequiredEnvDiagnostics(source));
    const logged = JSON.stringify(payload);
    expect(logged).not.toContain("anon-key-leak-test");
    expect(logged).not.toContain("https://example");
    expect(logged).not.toMatch(/sb_secret|sk-/i);
    errorSpy.mockRestore();
  });

  it("exposes missing env names on Vercel preview despite NODE_ENV=production", async () => {
    const response = serverMisconfiguredResponse({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
    });
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.missing).toEqual(listServerEnvConfigurationIssues({}));
  });

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
    expect(JSON.stringify(publicSupabaseConfig(env))).not.toContain("jv_live_test");
  });

  it("reports configuration presence as booleans and omits environment values", () => {
    expect(readServerEnvPresence({})).toEqual({
      supabaseUrlPresent: false,
      anonKeyPresent: false,
      serviceRoleKeyPresent: false,
      storageBucketPresent: false,
      discoverPromptVersionPresent: false,
      discoverPromptVersionIsLatest: false,
      jevApiKeyPresent: false,
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
      jevApiKeyPresent: false,
    });
    expect(Object.values(presence).every((value) => typeof value === "boolean")).toBe(true);
    const serialized = JSON.stringify(presence);
    expect(serialized).not.toContain("anon-key");
    expect(serialized).not.toContain("service-role-key");
    expect(serialized).not.toContain("https://example.supabase.co");
  });

  it("rejects an unpinned discover prompt version", () => {
    expect(
      listServerEnvConfigurationIssues({
        ...REQUIRED,
        HIVE_DISCOVER_PROMPT_VERSION: "latest",
      }),
    ).toEqual(["HIVE_DISCOVER_PROMPT_VERSION"]);
    expect(() =>
      readServerEnv({
        ...REQUIRED,
        HIVE_DISCOVER_PROMPT_VERSION: "latest",
      }),
    ).toThrow(/HIVE_DISCOVER_PROMPT_VERSION/);
  });

  it("does not reference the service-role key from client modules", () => {
    const root = join(process.cwd(), "src");
    const allowed = new Set([
      "lib/env/server-env.ts",
      "lib/env/committed-env-guard.ts",
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

  it("keeps the Jev key server-side and requires only JEV_API_KEY for Intake", () => {
    const env = readServerEnv({
      ...REQUIRED,
      JEV_API_KEY: "jv_live_test",
    });
    expect(env.JEV_API_KEY).toBe("jv_live_test");
    expect(JSON.stringify(publicSupabaseConfig(env))).not.toContain("jv_live_test");
    expect(readJevClassifierConfig({ JEV_API_KEY: "jv_live_test" })).toEqual({
      apiKey: "jv_live_test",
    });
    expect(readJevClassifierConfig({})).toBeNull();
    expect(readJevClassifierConfig({ JEV_API_KEY: "  " })).toBeNull();

    const root = join(process.cwd(), "src");
    const allowed = new Set([
      "lib/env/server-env.ts",
      "lib/env/committed-env-guard.ts",
      "lib/intake/intake-service-server.ts",
    ]);
    const offenders = walk(root).filter((file) => {
      const source = readFileSync(file, "utf8");
      if (!source.includes("JEV_API_KEY")) {
        return false;
      }
      const rel = relative(root, file).replaceAll("\\", "/");
      return !allowed.has(rel) && !rel.endsWith(".test.ts");
    });
    expect(offenders).toEqual([]);
  });
});
