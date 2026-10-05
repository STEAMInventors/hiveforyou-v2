import { createOpenAICallModel } from "@hiveforyou/model-providers/openai";
import type { CallModel } from "@hiveforyou/core";

export function createWorkerStoryWriterCallModel(env: {
  OPENAI_API_KEY?: string;
}): CallModel {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return async () => {
      throw new Error("STORY_MODEL_NO_API_KEY");
    };
  }
  return createOpenAICallModel({ apiKey });
}

export function createWorkerOpenAiCallModel(env: { OPENAI_API_KEY?: string }): CallModel | undefined {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return undefined;
  }
  return createOpenAICallModel({ apiKey });
}
