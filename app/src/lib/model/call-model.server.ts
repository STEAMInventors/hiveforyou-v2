import "server-only";

import { createCallModelFromEnv } from "@hiveforyou/model-providers/env";
import type { CallModel } from "@hiveforyou/core";

import type { ServerEnv } from "@/lib/env/server-env";

export function callModelEnvFromServerEnv(env: ServerEnv): Record<string, string | undefined> {
  return {
    MODEL_PROVIDER: env.MODEL_PROVIDER,
    MODEL_NAME: env.MODEL_NAME,
    MODEL_MAX_OUTPUT_TOKENS:
      env.MODEL_MAX_OUTPUT_TOKENS != null ? String(env.MODEL_MAX_OUTPUT_TOKENS) : undefined,
    OPENAI_API_KEY: env.OPENAI_API_KEY,
    HIVE_ANTHROPIC_API_KEY: env.HIVE_ANTHROPIC_API_KEY,
    HIVE_ANTHROPIC_WORKSPACE_ID: env.HIVE_ANTHROPIC_WORKSPACE_ID,
  };
}

/** Returns a CallModel when the selected provider's API key is configured; otherwise undefined. */
export function callModelFromEnv(
  source: Record<string, string | undefined> = process.env,
): CallModel | undefined {
  const provider = source.MODEL_PROVIDER?.trim().toLowerCase() ?? "openai";
  const hasKey =
    provider === "anthropic"
      ? Boolean(source.HIVE_ANTHROPIC_API_KEY?.trim())
      : Boolean(source.OPENAI_API_KEY?.trim());
  if (!hasKey) {
    return undefined;
  }
  return createCallModelFromEnv(source).callModel;
}

/** Fail-closed when the selected provider's API key is missing. */
export function requireCallModelFromEnv(
  source: Record<string, string | undefined> = process.env,
): CallModel {
  return createCallModelFromEnv(source).callModel;
}

export function callModelFromServerEnv(env: ServerEnv): CallModel | undefined {
  return callModelFromEnv(callModelEnvFromServerEnv(env));
}

export function requireCallModelFromServerEnv(env: ServerEnv): CallModel {
  return requireCallModelFromEnv(callModelEnvFromServerEnv(env));
}
