import { createCallModelFromEnv } from "@hiveforyou/model-providers/env";
import type { CallModel } from "@hiveforyou/core";

function envRecord(env: Record<string, string | undefined>): Record<string, string | undefined> {
  return env;
}

export function createWorkerStoryWriterCallModel(env: Record<string, string | undefined>): CallModel {
  try {
    return createCallModelFromEnv(envRecord(env)).callModel;
  } catch {
    return async () => {
      throw new Error("STORY_MODEL_NO_API_KEY");
    };
  }
}

export function createWorkerOpenAiCallModel(
  env: Record<string, string | undefined>,
): CallModel | undefined {
  const provider = env.MODEL_PROVIDER?.trim().toLowerCase() ?? "openai";
  const hasKey =
    provider === "anthropic"
      ? Boolean(env.HIVE_ANTHROPIC_API_KEY?.trim())
      : Boolean(env.OPENAI_API_KEY?.trim());
  if (!hasKey) {
    return undefined;
  }
  return createCallModelFromEnv(envRecord(env)).callModel;
}
