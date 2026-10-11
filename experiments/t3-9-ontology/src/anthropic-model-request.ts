import type { ModelRequest } from "@hiveforyou/shared/model/call-model";

import { ONTOLOGY_EXPERIMENT_BUDGET } from "./prompt.js";

export const CLAUDE_OPUS_5_5_MODEL = "claude-opus-5-5";

/** Anthropic Opus 5.5 rejects explicit temperature; omit the field entirely. */
export function anthropicModelOmitsTemperature(modelName: string): boolean {
  return modelName.trim().toLowerCase() === CLAUDE_OPUS_5_5_MODEL;
}

export function resolveExperimentTemperature(input: {
  provider: string;
  modelName: string;
  temperature: number;
}): number | undefined {
  if (input.provider === "anthropic" && anthropicModelOmitsTemperature(input.modelName)) {
    return undefined;
  }
  return input.temperature;
}

export type ExperimentBudgetMetadata = {
  temperature: number | "omitted";
  maxOutputTokens: number;
  concurrency: number;
};

export function experimentBudgetMetadata(provider: string, modelName: string): ExperimentBudgetMetadata {
  const { temperature, maxOutputTokens, concurrency } = ONTOLOGY_EXPERIMENT_BUDGET;
  if (provider === "anthropic" && anthropicModelOmitsTemperature(modelName)) {
    return { maxOutputTokens, concurrency, temperature: "omitted" };
  }
  return { maxOutputTokens, concurrency, temperature };
}

export type AnthropicMessagesCreateRequest = {
  model: string;
  max_tokens: number;
  messages: Array<{ role: "user"; content: string }>;
  system?: Array<{ type: "text"; text: string }>;
  temperature?: number;
};

/** Minimal Anthropic Messages API body used for dry-run inspection and tests. */
export function buildAnthropicMessagesCreateRequest(input: {
  modelName: string;
  maxOutputTokens: number;
  systemPrompt?: string;
  userContent: string;
  temperature?: number;
}): AnthropicMessagesCreateRequest {
  const temperature = anthropicModelOmitsTemperature(input.modelName)
    ? undefined
    : input.temperature;

  return {
    model: input.modelName,
    max_tokens: input.maxOutputTokens,
    messages: [{ role: "user", content: input.userContent }],
    ...(input.systemPrompt
      ? {
          system: [{ type: "text" as const, text: input.systemPrompt }],
        }
      : {}),
    ...(temperature != null ? { temperature } : {}),
  };
}

export function buildExperimentModelRequest(
  input: Omit<ModelRequest, "temperature"> & {
    provider: string;
    temperature?: number;
  },
): ModelRequest {
  const temperature = resolveExperimentTemperature({
    provider: input.provider,
    modelName: input.model,
    temperature: input.temperature ?? ONTOLOGY_EXPERIMENT_BUDGET.temperature,
  });
  const { provider: _provider, ...modelRequest } = input;
  return temperature != null ? { ...modelRequest, temperature } : modelRequest;
}
