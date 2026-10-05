import "server-only";

import {
  createCallModelFromEnv,
  isCanonicalStudyFixtureMode,
  isDiscoverFixtureMode,
  readCanonicalStudyPassSettings,
  readDiscoverPassSettings,
  tryCreateCallModelFromEnv,
} from "@hiveforyou/model-providers/env";
import {
  createCanonicalStudyEngineFromEnv,
  createDiscoverEngineFromEnv,
  createDiscoverResolutionEngineFromEnv,
  type DiscoverEngineConfig,
  type DiscoverResolutionEngineConfig,
} from "@hiveforyou/core";
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
    HIVE_CANONICAL_STUDY_ENGINE: env.HIVE_CANONICAL_STUDY_ENGINE,
    HIVE_CANONICAL_STUDY_REASONING_EFFORT: env.HIVE_CANONICAL_STUDY_REASONING_EFFORT,
    HIVE_CANONICAL_STUDY_MAX_OUTPUT_TOKENS:
      env.HIVE_CANONICAL_STUDY_MAX_OUTPUT_TOKENS != null
        ? String(env.HIVE_CANONICAL_STUDY_MAX_OUTPUT_TOKENS)
        : undefined,
    HIVE_DISCOVER_ENGINE: env.HIVE_DISCOVER_ENGINE,
    HIVE_DISCOVER_REASONING_EFFORT: env.HIVE_DISCOVER_REASONING_EFFORT,
    HIVE_STORY_WRITER_ENGINE: env.HIVE_STORY_WRITER_ENGINE,
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

export function canonicalStudyEngineFromServerEnv(
  env: ServerEnv,
  promptVersion: "v3" | "v4",
) {
  const source = callModelEnvFromServerEnv(env);
  const bundle = tryCreateCallModelFromEnv(source);
  const pass = readCanonicalStudyPassSettings(source);
  return createCanonicalStudyEngineFromEnv(
    {
      engine: isCanonicalStudyFixtureMode(source) ? "fixture" : undefined,
      reasoningEffort: pass.reasoningEffort,
      maxOutputTokens: pass.maxOutputTokens ?? bundle?.maxOutputTokens,
    },
    {
      promptVersion,
      callModel: bundle ? callModelFromEnv(source) : undefined,
      modelName: bundle?.modelName,
    },
  );
}

export function discoverEngineFromServerEnv(
  env: ServerEnv,
  adaptiveV2: boolean,
): DiscoverEngineConfig {
  const source = callModelEnvFromServerEnv(env);
  const pass = readDiscoverPassSettings(source);
  const bundle = tryCreateCallModelFromEnv(source);
  return createDiscoverEngineFromEnv(
    {
      engine: isDiscoverFixtureMode(source) ? "fixture" : undefined,
      reasoningEffort: pass.reasoningEffort,
    },
    {
      adaptiveV2,
      callModel: bundle ? callModelFromEnv(source) : undefined,
      modelName: bundle?.modelName,
    },
  );
}

export function discoverResolutionEngineFromServerEnv(
  env: ServerEnv,
): DiscoverResolutionEngineConfig {
  const source = callModelEnvFromServerEnv(env);
  const pass = readDiscoverPassSettings(source);
  const bundle = tryCreateCallModelFromEnv(source);
  return createDiscoverResolutionEngineFromEnv(
    {
      engine: isDiscoverFixtureMode(source) ? "fixture" : undefined,
      reasoningEffort: pass.reasoningEffort,
    },
    {
      callModel: bundle ? callModelFromEnv(source) : undefined,
      modelName: bundle?.modelName,
    },
  );
}
