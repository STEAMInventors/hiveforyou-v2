import "server-only";

import { createOpenAICallModel } from "@hiveforyou/model-providers/openai";
import type { CallModel } from "@hiveforyou/core";

import type { ServerEnv } from "@/lib/env/server-env";

export function openAiCallModelFromEnv(env: Pick<ServerEnv, "OPENAI_API_KEY">): CallModel | undefined {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return undefined;
  }
  return createOpenAICallModel({ apiKey });
}
