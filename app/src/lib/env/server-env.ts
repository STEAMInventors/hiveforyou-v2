import "server-only";

export const SERVER_REQUIRED_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "HIVE_STORAGE_BUCKET",
  "HIVE_DISCOVER_PROMPT_VERSION",
] as const;

const REQUIRED_SERVER_ENV = SERVER_REQUIRED_ENV_KEYS;

export type ServerRequiredEnvKeyDiagnostic = {
  present: boolean;
  nonEmptyAfterTrim: boolean;
};

/** Per required key: typeof string and non-empty after trim only — never values. */
export function readServerRequiredEnvDiagnostics(
  source: Record<string, string | undefined> = process.env,
): Record<(typeof SERVER_REQUIRED_ENV_KEYS)[number], ServerRequiredEnvKeyDiagnostic> {
  const diagnostics = {} as Record<
    (typeof SERVER_REQUIRED_ENV_KEYS)[number],
    ServerRequiredEnvKeyDiagnostic
  >;
  for (const key of SERVER_REQUIRED_ENV_KEYS) {
    const raw = source[key];
    diagnostics[key] = {
      present: typeof raw === "string",
      nonEmptyAfterTrim: Boolean(raw?.trim()),
    };
  }
  return diagnostics;
}

export type ServerEnv = {
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  HIVE_STORAGE_BUCKET: string;
  HIVE_DISCOVER_PROMPT_VERSION: string;
  HIVE_CANONICAL_STUDY_ENGINE?: string;
  HIVE_CANONICAL_STUDY_MODEL?: string;
  HIVE_CANONICAL_STUDY_REASONING_EFFORT?: string;
  HIVE_CANONICAL_STUDY_MAX_OUTPUT_TOKENS?: number;
  HIVE_STORY_WRITER_ENGINE?: string;
  HIVE_STORY_WRITER_MODEL?: string;
  HIVE_DISCOVER_ENGINE?: string;
  HIVE_DISCOVER_MODEL?: string;
  HIVE_DISCOVER_REASONING_EFFORT?: string;
  HIVE_OPENAI_MODEL?: string;
  HIVE_OPENAI_MAX_OUTPUT_TOKENS?: number;
  MODEL_PROVIDER?: string;
  MODEL_NAME?: string;
  MODEL_MAX_OUTPUT_TOKENS?: number;
  OPENAI_API_KEY?: string;
  HIVE_ANTHROPIC_API_KEY?: string;
  HIVE_ANTHROPIC_WORKSPACE_ID?: string;
  JEV_API_KEY?: string;
};

function envValuePresent(source: Record<string, string | undefined>, key: string): boolean {
  return Boolean(source[key]?.trim());
}

/** Booleans only. Does not return environment values, keys, tokens, or secrets. */
export function readServerEnvPresence(
  source: Record<string, string | undefined> = process.env,
): {
  supabaseUrlPresent: boolean;
  anonKeyPresent: boolean;
  serviceRoleKeyPresent: boolean;
  storageBucketPresent: boolean;
  discoverPromptVersionPresent: boolean;
  discoverPromptVersionIsLatest: boolean;
  jevApiKeyPresent: boolean;
} {
  return {
    supabaseUrlPresent: envValuePresent(source, "NEXT_PUBLIC_SUPABASE_URL"),
    anonKeyPresent: envValuePresent(source, "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceRoleKeyPresent: envValuePresent(source, "SUPABASE_SERVICE_ROLE_KEY"),
    storageBucketPresent: envValuePresent(source, "HIVE_STORAGE_BUCKET"),
    discoverPromptVersionPresent: envValuePresent(source, "HIVE_DISCOVER_PROMPT_VERSION"),
    discoverPromptVersionIsLatest:
      source.HIVE_DISCOVER_PROMPT_VERSION?.trim().toLowerCase() === "latest",
    jevApiKeyPresent: envValuePresent(source, "JEV_API_KEY"),
  };
}

/** Missing or invalid required configuration (variable names only, never values). */
export function listServerEnvConfigurationIssues(
  source: Record<string, string | undefined> = process.env,
): string[] {
  const issues = REQUIRED_SERVER_ENV.filter((key) => !source[key]?.trim());
  const discoverRaw = source.HIVE_DISCOVER_PROMPT_VERSION?.trim();
  if (discoverRaw && discoverRaw.toLowerCase() === "latest") {
    issues.push("HIVE_DISCOVER_PROMPT_VERSION");
  }
  return issues;
}

export function readServerEnv(
  source: Record<string, string | undefined> = process.env,
): ServerEnv {
  const missing = listServerEnvConfigurationIssues(source);
  if (missing.length > 0) {
    throw new Error(`Missing required server environment: ${missing.join(", ")}`);
  }
  const discoverPromptVersion = source.HIVE_DISCOVER_PROMPT_VERSION!.trim();
  if (discoverPromptVersion.toLowerCase() === "latest") {
    throw new Error("HIVE_DISCOVER_PROMPT_VERSION must name a prompt file, not latest.");
  }
  return {
    NEXT_PUBLIC_SUPABASE_URL: source.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: source.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim(),
    SUPABASE_SERVICE_ROLE_KEY: source.SUPABASE_SERVICE_ROLE_KEY!.trim(),
    HIVE_STORAGE_BUCKET: source.HIVE_STORAGE_BUCKET!.trim(),
    HIVE_DISCOVER_PROMPT_VERSION: discoverPromptVersion,
    HIVE_CANONICAL_STUDY_ENGINE: source.HIVE_CANONICAL_STUDY_ENGINE?.trim() || undefined,
    HIVE_CANONICAL_STUDY_MODEL: source.HIVE_CANONICAL_STUDY_MODEL?.trim() || undefined,
    HIVE_CANONICAL_STUDY_REASONING_EFFORT:
      source.HIVE_CANONICAL_STUDY_REASONING_EFFORT?.trim() || undefined,
    HIVE_CANONICAL_STUDY_MAX_OUTPUT_TOKENS: parseOptionalPositiveInt(
      source.HIVE_CANONICAL_STUDY_MAX_OUTPUT_TOKENS ?? source.HIVE_OPENAI_MAX_OUTPUT_TOKENS,
    ),
    HIVE_STORY_WRITER_ENGINE: source.HIVE_STORY_WRITER_ENGINE?.trim() || undefined,
    HIVE_STORY_WRITER_MODEL: source.HIVE_STORY_WRITER_MODEL?.trim() || undefined,
    HIVE_DISCOVER_ENGINE: source.HIVE_DISCOVER_ENGINE?.trim() || undefined,
    HIVE_DISCOVER_MODEL: source.HIVE_DISCOVER_MODEL?.trim() || undefined,
    HIVE_DISCOVER_REASONING_EFFORT:
      source.HIVE_DISCOVER_REASONING_EFFORT?.trim() || undefined,
    HIVE_OPENAI_MODEL: source.HIVE_OPENAI_MODEL?.trim() || undefined,
    HIVE_OPENAI_MAX_OUTPUT_TOKENS: parseOptionalPositiveInt(source.HIVE_OPENAI_MAX_OUTPUT_TOKENS),
    MODEL_PROVIDER: source.MODEL_PROVIDER?.trim() || undefined,
    MODEL_NAME: source.MODEL_NAME?.trim() || undefined,
    MODEL_MAX_OUTPUT_TOKENS: parseOptionalPositiveInt(source.MODEL_MAX_OUTPUT_TOKENS),
    OPENAI_API_KEY: source.OPENAI_API_KEY?.trim() || undefined,
    HIVE_ANTHROPIC_API_KEY: source.HIVE_ANTHROPIC_API_KEY?.trim() || undefined,
    HIVE_ANTHROPIC_WORKSPACE_ID: source.HIVE_ANTHROPIC_WORKSPACE_ID?.trim() || undefined,
    JEV_API_KEY: source.JEV_API_KEY?.trim() || undefined,
  };
}

/** Server-side Jev credentials. Never send the key to the browser. */
export function readJevClassifierConfig(
  source: Record<string, string | undefined> = process.env,
): { apiKey: string } | null {
  const apiKey = source.JEV_API_KEY?.trim() ?? "";
  if (!apiKey) {
    return null;
  }
  return { apiKey };
}

function parseOptionalPositiveInt(value: string | undefined): number | undefined {
  if (!value?.trim()) {
    return undefined;
  }
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

/** Values that may be exposed to the browser. The service-role key is excluded. */
export function publicSupabaseConfig(env: ServerEnv): {
  url: string;
  anonKey: string;
} {
  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}
