import "server-only";

import type { CallModel } from "@hiveforyou/core";
import { createOpenAICallModel } from "@hiveforyou/core/discover/openai-engine";

import type { ServerEnv } from "@/lib/env/server-env";

export function createStoryWriterCallModel(env: ServerEnv): CallModel {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return async () => {
      throw new Error("STORY_MODEL_NO_API_KEY");
    };
  }
  return createOpenAICallModel({ apiKey });
}
