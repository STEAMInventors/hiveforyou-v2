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
  return {
    inputTokens:
      typeof inputRaw === "number" && Number.isFinite(inputRaw) ? Math.round(inputRaw) : undefined,
    outputTokens:
      typeof outputRaw === "number" && Number.isFinite(outputRaw) ? Math.round(outputRaw) : undefined,
  };
}
