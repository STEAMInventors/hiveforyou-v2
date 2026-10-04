import "server-only";

export type HivePipelineMode = "inline" | "inngest";

export function readHivePipeline(
  source: Record<string, string | undefined> = process.env,
): HivePipelineMode {
  const value = source.HIVE_PIPELINE?.trim().toLowerCase();
  if (value === "inngest") {
    return "inngest";
  }
  return "inline";
}

export function isInngestIntakePipeline(
  source: Record<string, string | undefined> = process.env,
): boolean {
  return readHivePipeline(source) === "inngest";
}
