import type { CallModel } from "@hiveforyou/shared/model/call-model";

import { createAnthropicCallModel } from "./anthropic-call-model";
import { createOpenAICallModel } from "./openai-call-model";

export type ModelProviderId = "openai" | "anthropic";

export type CallModelFromEnvResult = {
  provider: ModelProviderId;
  modelName: string;
  maxOutputTokens: number;
  callModel: CallModel;
};

const DEFAULT_OPENAI_MODEL = "gpt-5.6-sol";
const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";
const DEFAULT_MAX_OUTPUT_TOKENS = 16_000;

function parseProvider(raw: string | undefined): ModelProviderId {
  const normalized = raw?.trim().toLowerCase();
  if (!normalized || normalized === "openai") {
    return "openai";
  }
  if (normalized === "anthropic") {
    return "anthropic";
  }
  throw new Error(`MODEL_PROVIDER must be openai or anthropic (got "${raw}")`);
}

function parseMaxOutputTokens(raw: string | undefined): number {
  if (!raw?.trim()) {
    return DEFAULT_MAX_OUTPUT_TOKENS;
  }
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`MODEL_MAX_OUTPUT_TOKENS must be a positive integer (got "${raw}")`);
  }
  return parsed;
}

export function createCallModelFromEnv(
  source: Record<string, string | undefined> = process.env,
): CallModelFromEnvResult {
  const provider = parseProvider(source.MODEL_PROVIDER);
  const maxOutputTokens = parseMaxOutputTokens(source.MODEL_MAX_OUTPUT_TOKENS);

  if (provider === "openai") {
    const apiKey = source.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is required when MODEL_PROVIDER=openai");
    }
    const modelName = source.MODEL_NAME?.trim() || DEFAULT_OPENAI_MODEL;
    return {
      provider,
      modelName,
      maxOutputTokens,
      callModel: createOpenAICallModel({ apiKey }),
    };
  }

  const apiKey = source.HIVE_ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("HIVE_ANTHROPIC_API_KEY is required when MODEL_PROVIDER=anthropic");
  }
  const modelName = source.MODEL_NAME?.trim() || DEFAULT_ANTHROPIC_MODEL;
  const workspaceId = source.HIVE_ANTHROPIC_WORKSPACE_ID?.trim() || undefined;
  return {
    provider,
    modelName,
    maxOutputTokens,
    callModel: createAnthropicCallModel({
      apiKey,
      model: modelName,
      defaultMaxOutputTokens: maxOutputTokens,
      workspaceId,
    }),
  };
}
