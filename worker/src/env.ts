import { warnLegacyModelEnvVars } from "@hiveforyou/model-providers/env";

export function assertWorkerStartPolicy(
  source: Record<string, string | undefined> = process.env,
): void {
  if (source.NODE_ENV?.trim() !== "production") {
    return;
  }
  if (source.INNGEST_DEV?.trim()) {
    throw new Error("WORKER_INNGEST_DEV_FORBIDDEN_IN_PRODUCTION");
  }
  if (source.HIVE_FAULT_INJECT?.trim()) {
    throw new Error("WORKER_FAULT_INJECT_FORBIDDEN_IN_PRODUCTION");
  }
  if (!source.INNGEST_SIGNING_KEY?.trim()) {
    throw new Error("WORKER_INNGEST_SIGNING_KEY_REQUIRED");
  }
}

export type WorkerEnv = {
  NEXT_PUBLIC_SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  HIVE_STORAGE_BUCKET: string;
  HIVE_WORKER_MODE: "connect" | "serve";
  HIVE_WORKER_SERVE_PORT: number;
  HIVE_CANONICAL_STUDY_ENGINE?: string;
  OPENAI_API_KEY?: string;
  HIVE_ANTHROPIC_API_KEY?: string;
  HIVE_ANTHROPIC_WORKSPACE_ID?: string;
  MODEL_PROVIDER?: string;
  MODEL_NAME?: string;
  MODEL_MAX_OUTPUT_TOKENS?: string;
  HIVE_CANONICAL_STUDY_MODEL?: string;
  HIVE_OPENAI_MODEL?: string;
  HIVE_CANONICAL_STUDY_REASONING_EFFORT?: string;
  HIVE_CANONICAL_STUDY_MAX_OUTPUT_TOKENS?: string;
  HIVE_OPENAI_MAX_OUTPUT_TOKENS?: string;
  HIVE_STORY_WRITER_ENGINE?: string;
  HIVE_STORY_WRITER_MODEL?: string;
  HIVE_STUDY_SHADOW?: string;
  HIVE_DOCUMENT_PAGES_BUCKET?: string;
  /** Dev-only: `extract-once` fails the first extract step once per document id. */
  HIVE_FAULT_INJECT?: "extract-once";
};

export function readWorkerEnv(
  source: Record<string, string | undefined> = process.env,
): WorkerEnv {
  const url = source.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRole = source.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const storageBucket = source.HIVE_STORAGE_BUCKET?.trim();
  if (!url || !serviceRole || !storageBucket) {
    throw new Error("WORKER_ENV_INCOMPLETE");
  }
  warnLegacyModelEnvVars(source);
  const modeRaw = source.HIVE_WORKER_MODE?.trim() ?? "connect";
  const mode = modeRaw === "serve" ? "serve" : "connect";
  const portRaw = source.HIVE_WORKER_SERVE_PORT?.trim();
  const port = portRaw ? Number(portRaw) : 3001;
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error("WORKER_SERVE_PORT_INVALID");
  }
  const faultRaw = source.HIVE_FAULT_INJECT?.trim();
  const HIVE_FAULT_INJECT =
    faultRaw === "extract-once" && source.NODE_ENV === "development"
      ? ("extract-once" as const)
      : undefined;

  return {
    NEXT_PUBLIC_SUPABASE_URL: url,
    SUPABASE_SERVICE_ROLE_KEY: serviceRole,
    HIVE_STORAGE_BUCKET: storageBucket,
    HIVE_WORKER_MODE: mode,
    HIVE_WORKER_SERVE_PORT: port,
    HIVE_CANONICAL_STUDY_ENGINE: source.HIVE_CANONICAL_STUDY_ENGINE?.trim() || undefined,
    OPENAI_API_KEY: source.OPENAI_API_KEY?.trim() || undefined,
    HIVE_ANTHROPIC_API_KEY: source.HIVE_ANTHROPIC_API_KEY?.trim() || undefined,
    HIVE_ANTHROPIC_WORKSPACE_ID: source.HIVE_ANTHROPIC_WORKSPACE_ID?.trim() || undefined,
    MODEL_PROVIDER: source.MODEL_PROVIDER?.trim() || undefined,
    MODEL_NAME: source.MODEL_NAME?.trim() || undefined,
    MODEL_MAX_OUTPUT_TOKENS: source.MODEL_MAX_OUTPUT_TOKENS?.trim() || undefined,
    HIVE_CANONICAL_STUDY_MODEL: source.HIVE_CANONICAL_STUDY_MODEL?.trim() || undefined,
    HIVE_OPENAI_MODEL: source.HIVE_OPENAI_MODEL?.trim() || undefined,
    HIVE_CANONICAL_STUDY_REASONING_EFFORT:
      source.HIVE_CANONICAL_STUDY_REASONING_EFFORT?.trim() || undefined,
    HIVE_CANONICAL_STUDY_MAX_OUTPUT_TOKENS:
      source.HIVE_CANONICAL_STUDY_MAX_OUTPUT_TOKENS?.trim() || undefined,
    HIVE_OPENAI_MAX_OUTPUT_TOKENS: source.HIVE_OPENAI_MAX_OUTPUT_TOKENS?.trim() || undefined,
    HIVE_STORY_WRITER_ENGINE: source.HIVE_STORY_WRITER_ENGINE?.trim() || undefined,
    HIVE_STORY_WRITER_MODEL: source.HIVE_STORY_WRITER_MODEL?.trim() || undefined,
    HIVE_STUDY_SHADOW: source.HIVE_STUDY_SHADOW?.trim() || undefined,
    HIVE_DOCUMENT_PAGES_BUCKET: source.HIVE_DOCUMENT_PAGES_BUCKET?.trim() || undefined,
    HIVE_FAULT_INJECT,
  };
}
