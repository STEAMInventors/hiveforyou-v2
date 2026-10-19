import "server-only";

import type { CallModel } from "@hiveforyou/core";
import { createCallModelFromOpenAIClient } from "@hiveforyou/shared/llm/call-model-from-openai-client";
import { getLLMRouter } from "@hiveforyou/shared/llm/router";

import type { ServerEnv } from "@/lib/env/server-env";

export function createStoryWriterCallModel(_env: ServerEnv): CallModel {
  const { client } = getLLMRouter("heavy_lifter");
  return createCallModelFromOpenAIClient(client);
}
