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

export function parseModelUsage(usage: unknown): {
  inputTokens?: number;
  outputTokens?: number;
} {
  if (typeof usage !== "object" || usage === null) {
    return {};
  }
  const record = usage as Record<string, unknown>;
  const inputRaw =
    record.input_tokens ?? record.prompt_tokens ?? record.inputTokens ?? record.promptTokens;
  const outputRaw =
    record.output_tokens ?? record.completion_tokens ?? record.outputTokens ?? record.completionTokens;
  const inputTokens =
    typeof inputRaw === "number" && Number.isFinite(inputRaw) ? Math.round(inputRaw) : undefined;
  const outputTokens =
    typeof outputRaw === "number" && Number.isFinite(outputRaw) ? Math.round(outputRaw) : undefined;
  return { inputTokens, outputTokens };
}

export const LEGACY_MODEL_ENV_VAR_NAMES = [
  "HIVE_CANONICAL_STUDY_ENGINE",
  "HIVE_CANONICAL_STUDY_MODEL",
  "HIVE_STORY_WRITER_MODEL",
  "HIVE_DISCOVER_ENGINE",
  "HIVE_DISCOVER_MODEL",
  "HIVE_OPENAI_MODEL",
  "HIVE_OPENAI_MAX_OUTPUT_TOKENS",
] as const;

export type LegacyModelEnvVarName = (typeof LEGACY_MODEL_ENV_VAR_NAMES)[number];

export const PASS_LEVEL_MODEL_ENV_VAR_NAMES = [
  "HIVE_CANONICAL_STUDY_REASONING_EFFORT",
  "HIVE_CANONICAL_STUDY_MAX_OUTPUT_TOKENS",
  "HIVE_DISCOVER_REASONING_EFFORT",
  "HIVE_STORY_WRITER_ENGINE",
] as const;

const FIXTURE_ENGINE_VARS = new Set(["HIVE_CANONICAL_STUDY_ENGINE", "HIVE_DISCOVER_ENGINE"]);

export function listLegacyModelEnvVarsToWarn(
  source: Record<string, string | undefined>,
): LegacyModelEnvVarName[] {
  return LEGACY_MODEL_ENV_VAR_NAMES.filter((key) => {
    const raw = source[key]?.trim();
    if (!raw) {
      return false;
    }
    if (FIXTURE_ENGINE_VARS.has(key) && raw.toLowerCase() === "fixture") {
      return false;
    }
    return true;
  });
}

let legacyWarnedForProcess = false;

export function warnLegacyModelEnvVars(
  source: Record<string, string | undefined> = process.env,
  log: (line: string) => void = (line) => console.warn(line),
): void {
  if (legacyWarnedForProcess) {
    return;
  }
  const names = listLegacyModelEnvVarsToWarn(source);
  if (names.length === 0) {
    return;
  }
  legacyWarnedForProcess = true;
  for (const name of names) {
    log(`[hive/model-env] ${name} is ignored, use MODEL_PROVIDER/MODEL_NAME`);
  }
}

export function resetLegacyModelEnvWarnForTests(): void {
  legacyWarnedForProcess = false;
}

export function parseOptionalPositiveInt(raw: string | undefined): number | undefined {
  if (!raw?.trim()) {
    return undefined;
  }
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

export function readCanonicalStudyPassSettings(source: Record<string, string | undefined>): {
  reasoningEffort: string;
  maxOutputTokens?: number;
} {
  return {
    reasoningEffort: source.HIVE_CANONICAL_STUDY_REASONING_EFFORT?.trim() || "medium",
    maxOutputTokens: parseOptionalPositiveInt(source.HIVE_CANONICAL_STUDY_MAX_OUTPUT_TOKENS),
  };
}

export function readDiscoverPassSettings(source: Record<string, string | undefined>): {
  reasoningEffort: string;
} {
  return {
    reasoningEffort: source.HIVE_DISCOVER_REASONING_EFFORT?.trim() || "medium",
  };
}

export function isCanonicalStudyFixtureMode(source: Record<string, string | undefined>): boolean {
  return source.HIVE_CANONICAL_STUDY_ENGINE?.trim().toLowerCase() === "fixture";
}

export function isDiscoverFixtureMode(source: Record<string, string | undefined>): boolean {
  return source.HIVE_DISCOVER_ENGINE?.trim().toLowerCase() === "fixture";
}

export type ModelCallMetrics = {
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
};

export function tryCreateCallModelFromEnv(
  source: Record<string, string | undefined> = process.env,
): CallModelFromEnvResult | undefined {
  const provider = source.MODEL_PROVIDER?.trim().toLowerCase() ?? "openai";
  const hasKey =
    provider === "anthropic"
      ? Boolean(source.HIVE_ANTHROPIC_API_KEY?.trim())
      : Boolean(source.OPENAI_API_KEY?.trim());
  if (!hasKey) {
    return undefined;
  }
  return createCallModelFromEnv(source);
}

export function wrapCallModelWithMetrics(
  callModel: CallModel,
  provider: string,
  onComplete: (metrics: ModelCallMetrics) => void,
): CallModel {
  return async (req) => {
    const response = await callModel(req);
    const tokens = parseModelUsage(response.usage);
    onComplete({
      provider,
      model: req.model,
      ...tokens,
    });
    return response;
  };
}
