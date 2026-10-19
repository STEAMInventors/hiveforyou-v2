export type CanonicalReasonerModelUsage = {
  providerId: string;
  modelId: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheWriteInputTokens?: number;
  latencyMs: number;
  /** Rough USD estimate when model pricing table has a match; otherwise undefined. */
  estimatedCostUsd?: number;
};

/** Conservative static rates for telemetry (not billing authority). */
const ROUGH_USD_PER_MILLION: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 15, output: 75 },
  "claude-sonnet-5-5": { input: 3, output: 15 },
  "gpt-5.6-sol": { input: 2.5, output: 10 },
};

function parseModelUsage(usage: unknown): {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheWriteInputTokens?: number;
} {
  if (typeof usage !== "object" || usage === null) {
    return {};
  }
  const record = usage as Record<string, unknown>;
  const inputRaw =
    record.input_tokens ?? record.prompt_tokens ?? record.inputTokens ?? record.promptTokens;
  const outputRaw =
    record.output_tokens ?? record.completion_tokens ?? record.outputTokens ?? record.completionTokens;
  const cacheReadRaw = record.cacheReadInputTokens ?? record.cache_read_input_tokens;
  const cacheWriteRaw = record.cacheWriteInputTokens ?? record.cache_creation_input_tokens;
  const inputTokens =
    typeof inputRaw === "number" && Number.isFinite(inputRaw) ? Math.round(inputRaw) : undefined;
  const outputTokens =
    typeof outputRaw === "number" && Number.isFinite(outputRaw) ? Math.round(outputRaw) : undefined;
  const cacheReadInputTokens =
    typeof cacheReadRaw === "number" && Number.isFinite(cacheReadRaw)
      ? Math.round(cacheReadRaw)
      : undefined;
  const cacheWriteInputTokens =
    typeof cacheWriteRaw === "number" && Number.isFinite(cacheWriteRaw)
      ? Math.round(cacheWriteRaw)
      : undefined;
  return { inputTokens, outputTokens, cacheReadInputTokens, cacheWriteInputTokens };
}

function estimateCostUsd(
  modelId: string,
  inputTokens?: number,
  outputTokens?: number,
): number | undefined {
  const rates = ROUGH_USD_PER_MILLION[modelId];
  if (!rates) {
    return undefined;
  }
  const input = inputTokens ?? 0;
  const output = outputTokens ?? 0;
  return (input * rates.input + output * rates.output) / 1_000_000;
}

export function buildCanonicalReasonerModelUsage(input: {
  providerId: string;
  modelId: string;
  usage: unknown;
  latencyMs: number;
}): CanonicalReasonerModelUsage {
  const tokens = parseModelUsage(input.usage);
  return {
    providerId: input.providerId,
    modelId: input.modelId,
    ...tokens,
    latencyMs: input.latencyMs,
    estimatedCostUsd: estimateCostUsd(input.modelId, tokens.inputTokens, tokens.outputTokens),
  };
}
