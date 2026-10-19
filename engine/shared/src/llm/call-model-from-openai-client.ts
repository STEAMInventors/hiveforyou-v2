import type OpenAI from "openai";

import type { CallModel, ModelRequest } from "../model/call-model.js";

/** LiteLLM-compatible {@link CallModel} using OpenAI SDK chat completions. */
export function createCallModelFromOpenAIClient(client: OpenAI): CallModel {
  return async (req: ModelRequest) => {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    if (!req.userOnly && req.systemPrompt?.trim()) {
      messages.push({ role: "system", content: req.systemPrompt });
    }
    messages.push({ role: "user", content: req.userContent });

    const responseFormat =
      req.textFormat.type === "json_schema"
        ? {
            type: "json_schema" as const,
            json_schema: {
              name: req.textFormat.name,
              strict: req.textFormat.strict,
              schema: req.textFormat.schema,
            },
          }
        : { type: "json_object" as const };

    const completion = await client.chat.completions.create({
      model: req.model,
      messages,
      response_format: responseFormat,
      ...(req.maxOutputTokens != null && req.maxOutputTokens > 0
        ? { max_tokens: req.maxOutputTokens }
        : {}),
      ...(req.temperature != null ? { temperature: req.temperature } : {}),
    });

    const content = completion.choices[0]?.message?.content;
    return {
      outputText: typeof content === "string" ? content : null,
      usage: completion.usage,
    };
  };
}