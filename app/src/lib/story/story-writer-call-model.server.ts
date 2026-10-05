import "server-only";

import type { CallModel } from "@hiveforyou/core";

import { openAiCallModelFromEnv } from "@/lib/model/openai-call-model.server";
import type { ServerEnv } from "@/lib/env/server-env";

export function createStoryWriterCallModel(env: ServerEnv): CallModel {
  const callModel = openAiCallModelFromEnv(env);
  if (!callModel) {
    return async () => {
      throw new Error("STORY_MODEL_NO_API_KEY");
    };
  }
  return callModel;
}
