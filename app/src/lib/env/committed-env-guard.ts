/** Keys that must never appear in committed env files (values live in the platform). */
export const FORBIDDEN_COMMITTED_ENV_KEYS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "HIVE_ANTHROPIC_API_KEY",
  "INNGEST_EVENT_KEY",
  "INNGEST_SIGNING_KEY",
  "JEV_API_KEY",
  "HIVE_PREVIEW_PASSWORD",
  "HIVE_PREVIEW_AUTH_EMAIL",
  "HIVE_PREVIEW_AUTH_PASSWORD",
] as const;

/** Public *_KEY names allowed in committed files. */
export const PUBLIC_COMMITTED_ENV_KEY_ALLOWLIST = new Set<string>([
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
]);

/** Returns an issue code when bytes are not UTF-8 (e.g. PowerShell UTF-16 redirect). */
export function findCommittedEnvEncodingIssue(raw: Buffer): string | null {
  if (raw.length >= 2 && raw[0] === 0xff && raw[1] === 0xfe) {
    return "UTF16_LE_BOM";
  }
  if (raw.length >= 2 && raw[0] === 0xfe && raw[1] === 0xff) {
    return "UTF16_BE_BOM";
  }
  if (raw.length >= 4 && raw[1] === 0x00 && raw[3] === 0x00 && raw[0] !== 0x00) {
    return "UTF16_LE";
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(raw);
    return null;
  } catch {
    return "INVALID_UTF8";
  }
}

export function parseDotEnvLines(content: string): Map<string, string> {
  const normalized = content.replace(/^\uFEFF/, "");
  const entries = new Map<string, string>();
  for (const line of normalized.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }
    entries.set(match[1]!, match[2] ?? "");
  }
  return entries;
}

export function findForbiddenCommittedEnvKeys(content: string): string[] {
  const entries = parseDotEnvLines(content);
  const forbidden = new Set<string>();

  for (const key of FORBIDDEN_COMMITTED_ENV_KEYS) {
    if (entries.has(key)) {
      forbidden.add(key);
    }
  }

  for (const key of entries.keys()) {
    if (PUBLIC_COMMITTED_ENV_KEY_ALLOWLIST.has(key)) {
      continue;
    }
    if (key.endsWith("_KEY") || key.endsWith("_SECRET")) {
      forbidden.add(key);
    }
  }

  return [...forbidden].sort();
}

/** Non-secret keys that must match between app and worker committed env files. */
export const SHARED_APP_WORKER_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "HIVE_STORAGE_BUCKET",
  "HIVE_PIPELINE",
  "HIVE_CANONICAL_STUDY_ENGINE",
  "HIVE_CANONICAL_STUDY_MODEL",
  "HIVE_CANONICAL_STUDY_REASONING_EFFORT",
  "HIVE_CANONICAL_STUDY_MAX_OUTPUT_TOKENS",
  "HIVE_STORY_WRITER_ENGINE",
  "HIVE_STORY_WRITER_MODEL",
  "MODEL_PROVIDER",
  "MODEL_MAX_OUTPUT_TOKENS",
  "HIVE_ANTHROPIC_WORKSPACE_ID",
] as const;

export type SharedEnvMismatch = {
  key: (typeof SHARED_APP_WORKER_ENV_KEYS)[number];
  appValue: string;
  workerValue: string;
};

export function findSharedAppWorkerEnvMismatches(
  appEnvContent: string,
  workerEnvContent: string,
): SharedEnvMismatch[] {
  const app = parseDotEnvLines(appEnvContent);
  const worker = parseDotEnvLines(workerEnvContent);
  const mismatches: SharedEnvMismatch[] = [];
  for (const key of SHARED_APP_WORKER_ENV_KEYS) {
    const appValue = app.get(key) ?? "";
    const workerValue = worker.get(key) ?? "";
    if (appValue !== workerValue) {
      mismatches.push({ key, appValue, workerValue });
    }
  }
  return mismatches;
}