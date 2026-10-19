import OpenAI from "openai";

export type TaskTier = "heavy_lifter" | "harvester" | "sorter";

export interface RouteConfig {
  model: string;
  client: OpenAI;
}

/** Tier model alias from env without constructing a gateway client. */
export function resolveTierModelId(tier: TaskTier): string {
  switch (tier) {
    case "heavy_lifter":
      return process.env.MODEL_HEAVY_LIFTER?.trim() || "gpt-4o";
    case "harvester":
      return process.env.MODEL_HARVESTER?.trim() || "gemini/gemini-1.5-flash";
    case "sorter":
      return process.env.MODEL_SORTER?.trim() || "gpt-4o-mini";
  }
}

export function getLLMRouter(tier: TaskTier): RouteConfig {
  const baseURL = process.env.LITELLM_BASE_URL || "https://api.openai.com/v1";
  const apiKey = process.env.LITELLM_API_KEY || process.env.OPENAI_API_KEY;

  const client = new OpenAI({
    baseURL,
    apiKey,
  });

  const model = resolveTierModelId(tier);

  return { model, client };
}