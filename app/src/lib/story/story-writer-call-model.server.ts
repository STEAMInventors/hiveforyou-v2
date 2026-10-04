import "server-only";

import type { CallModel, ModelRequest } from "@hiveforyou/core";
import {
  defaultOpenAICreateResponse,
  extractOpenAIResponseOutputText,
} from "@hiveforyou/core/discover/openai-engine";

import type { ServerEnv } from "@/lib/env/server-env";

export function createStoryWriterCallModel(env: ServerEnv): CallModel {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return async () => {
      throw new Error("STORY_MODEL_NO_API_KEY");
    };
  }
  return async (req: ModelRequest) => {
    const body = {
      model: req.model,
      temperature: req.temperature,
      input: [
        { role: "system", content: [{ type: "input_text", text: req.systemPrompt }] },
        { role: "user", content: [{ type: "input_text", text: req.userContent }] },
      ],
      text: { format: req.textFormat },
    };
    const responsePayload = await defaultOpenAICreateResponse({
      apiKey,
      model: req.model,
      reasoningEffort: "low",
      body,
    });
    return {
      outputText: extractOpenAIResponseOutputText(responsePayload),
    };
  };
}
