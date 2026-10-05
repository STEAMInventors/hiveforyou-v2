/** Keys that must never appear in committed env files (values live in the platform). */
export const FORBIDDEN_COMMITTED_ENV_KEYS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "HIVE_ANTHROPIC_API_KEY",
  "INNGEST_EVENT_KEY",
  "INNGEST_SIGNING_KEY",
  "JEV_API_KEY",
] as const;

/** Public *_KEY names allowed in committed files. */
export const PUBLIC_COMMITTED_ENV_KEY_ALLOWLIST = new Set<string>([
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
]);

export function parseDotEnvLines(content: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const line of content.split(/\r?\n/)) {
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