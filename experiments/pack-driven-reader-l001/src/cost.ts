/** Approximate Anthropic Opus list pricing (USD per token) for qualification reporting. */
const INPUT_USD_PER_TOKEN = 15 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 75 / 1_000_000;
const CACHE_WRITE_USD_PER_TOKEN = INPUT_USD_PER_TOKEN * 1.25;
const CACHE_READ_USD_PER_TOKEN = INPUT_USD_PER_TOKEN * 0.1;

export function anthropicQualificationCostUsd(usage: {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheWriteInputTokens: number;
}): number {
  return (
    usage.inputTokens * INPUT_USD_PER_TOKEN +
    usage.outputTokens * OUTPUT_USD_PER_TOKEN +
    usage.cacheReadInputTokens * CACHE_READ_USD_PER_TOKEN +
    usage.cacheWriteInputTokens * CACHE_WRITE_USD_PER_TOKEN
  );
}

export function estimateTokensFromChars(chars: number): number {
  return Math.ceil(chars / 4);
}

export function estimateDryRunCostUsd(input: {
  stablePrefixChars: number;
  perDocumentUserChars: number[];
  maxOutputTokens: number;
  modelCalls: number;
}): number {
  let inputTokens = 0;
  let cacheWriteTokens = 0;
  let cacheReadTokens = 0;
  for (let i = 0; i < input.perDocumentUserChars.length; i++) {
    const userTokens = estimateTokensFromChars(input.perDocumentUserChars[i] ?? 0);
    const stableTokens = estimateTokensFromChars(input.stablePrefixChars);
    if (i === 0) {
      inputTokens += userTokens;
      cacheWriteTokens += stableTokens;
    } else {
      inputTokens += userTokens;
      cacheReadTokens += stableTokens;
    }
  }
  const outputTokens = input.maxOutputTokens * 0.35 * input.modelCalls;
  return anthropicQualificationCostUsd({
    inputTokens: Math.round(inputTokens),
    outputTokens: Math.round(outputTokens),
    cacheReadInputTokens: Math.round(cacheReadTokens),
    cacheWriteInputTokens: Math.round(cacheWriteTokens),
  });
}
