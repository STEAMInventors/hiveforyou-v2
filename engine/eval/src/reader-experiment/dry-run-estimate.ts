/** Heuristic token/cost estimates for Stage 2 dry-run (not measured spend). */

export type ReaderExperimentDryRunEstimate = {
  label: "ESTIMATE";
  configuredMaxOutputTokens: number;
  fixedToolOverhead: number;
  maxToolCalls: number;
  verifierSubmissionCapacity: number;
  goldenFactCount: number;
  stablePrefixTokensEstimate: number;
  documentBundleTokensEstimate: number;
  outputTokensAllowance: number;
  outputTruncationRisk: boolean;
  inputTokensTotalEstimate: number;
  costUsdPerVariantEstimate: { low: number; high: number };
};

const OPUS_INPUT_USD_PER_M = 15;
const OPUS_OUTPUT_USD_PER_M = 75;

export function estimateReaderExperimentDryRun(input: {
  configuredMaxOutputTokens: number;
  goldenFactCount: number;
  stablePrefixCharCount: number;
  documentBundleCharCount: number;
  fixedToolOverhead?: number;
  maxToolCalls?: number;
}): ReaderExperimentDryRunEstimate {
  const fixedToolOverhead = input.fixedToolOverhead ?? 9;
  const maxToolCalls = input.maxToolCalls ?? 165;
  const stablePrefixTokensEstimate = Math.ceil(input.stablePrefixCharCount / 4);
  const documentBundleTokensEstimate = Math.ceil(input.documentBundleCharCount / 4);
  const outputTokensAllowance = input.configuredMaxOutputTokens;
  const outputTruncationRisk = outputTokensAllowance > 0 && input.goldenFactCount * 120 > outputTokensAllowance * 0.7;
  const inputTokensTotalEstimate = stablePrefixTokensEstimate + documentBundleTokensEstimate + 512;
  const costLow =
    (inputTokensTotalEstimate / 1_000_000) * OPUS_INPUT_USD_PER_M +
    (4_000 / 1_000_000) * OPUS_OUTPUT_USD_PER_M;
  const costHigh =
    (inputTokensTotalEstimate / 1_000_000) * OPUS_INPUT_USD_PER_M +
    (outputTokensAllowance / 1_000_000) * OPUS_OUTPUT_USD_PER_M;

  return {
    label: "ESTIMATE",
    configuredMaxOutputTokens: input.configuredMaxOutputTokens,
    fixedToolOverhead,
    maxToolCalls,
    verifierSubmissionCapacity: Math.max(0, maxToolCalls - fixedToolOverhead),
    goldenFactCount: input.goldenFactCount,
    stablePrefixTokensEstimate,
    documentBundleTokensEstimate,
    outputTokensAllowance,
    outputTruncationRisk,
    inputTokensTotalEstimate,
    costUsdPerVariantEstimate: { low: costLow, high: costHigh },
  };
}
