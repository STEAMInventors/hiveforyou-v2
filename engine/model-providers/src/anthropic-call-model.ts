import Anthropic from "@anthropic-ai/sdk";
import type { CallModel, ModelFileAttachment, ModelRequest } from "@hiveforyou/shared/model/call-model";
import { ModelCallError } from "@hiveforyou/shared/model/call-model";

import { normalizeJsonEnumCasing } from "./normalize-schema-enum-casing.js";

const ANTHROPIC_EFFORT_LEVELS = new Set(["low", "medium", "high", "xhigh", "max"]);

export type AnthropicCallModelOptions = {
  apiKey: string;
  model: string;
  defaultMaxOutputTokens: number;
  createMessage?: (params: Anthropic.Messages.MessageCreateParamsNonStreaming) => Promise<Anthropic.Messages.Message>;
};

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function normalizeMimeType(mimeType: string | null | undefined): string {
  return (mimeType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

function attachmentToContentBlock(attachment: ModelFileAttachment): Anthropic.Messages.ContentBlockParam {
  const mime = normalizeMimeType(attachment.mimeType);
  const data = bytesToBase64(attachment.bytes);

  if (mime === "application/pdf") {
    return {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data,
      },
    };
  }

  if (mime === "image/jpeg" || mime === "image/png" || mime === "image/gif" || mime === "image/webp") {
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: mime,
        data,
      },
    };
  }

  throw new ModelCallError(
    "upload_failed",
    undefined,
    `ANTHROPIC_ATTACHMENT_UNSUPPORTED:${mime || "unknown"}`,
  );
}

function extractTextContent(content: Anthropic.Messages.ContentBlock[]): string | null {
  const parts: string[] = [];
  for (const block of content) {
    if (block.type === "text") {
      parts.push(block.text);
    }
  }
  return parts.length > 0 ? parts.join("") : null;
}

function mapAnthropicUsage(usage: Anthropic.Messages.Usage | undefined): {
  inputTokens: number;
  outputTokens: number;
} | undefined {
  if (!usage) {
    return undefined;
  }
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
  };
}

function mapReasoningEffortToOutputConfigEffort(
  reasoningEffort: string | undefined,
): "low" | "medium" | "high" | "xhigh" | "max" | undefined {
  const normalized = reasoningEffort?.trim().toLowerCase();
  if (!normalized || !ANTHROPIC_EFFORT_LEVELS.has(normalized)) {
    return undefined;
  }
  return normalized as "low" | "medium" | "high" | "xhigh" | "max";
}

function formatAnthropicError(error: unknown): string {
  if (error instanceof Anthropic.APIError) {
    return `ANTHROPIC_RESPONSE_FAILED:${error.status ?? "unknown"} message=${error.message}`;
  }
  if (error instanceof Error) {
    return `ANTHROPIC_RESPONSE_FAILED message=${error.message}`;
  }
  return "ANTHROPIC_RESPONSE_FAILED";
}

function parseJsonObjectOutput(text: string): string {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ModelCallError("response_failed", undefined, "ANTHROPIC_JSON_OBJECT_NOT_OBJECT");
    }
    return JSON.stringify(parsed);
  } catch (error) {
    if (error instanceof ModelCallError) {
      throw error;
    }
    throw new ModelCallError("response_failed", undefined, "ANTHROPIC_JSON_OBJECT_PARSE_FAILED");
  }
}

/** Host-side Anthropic adapter for {@link CallModel}. */
export function createAnthropicCallModel(input: AnthropicCallModelOptions): CallModel {
  const client = new Anthropic({ apiKey: input.apiKey });
  const createMessage = input.createMessage ?? client.messages.create.bind(client.messages);

  return async (req: ModelRequest) => {
    const userBlocks: Anthropic.Messages.ContentBlockParam[] = [
      ...(req.attachments ?? []).map(attachmentToContentBlock),
      { type: "text", text: req.userContent },
    ];

    const maxTokens =
      req.maxOutputTokens != null && req.maxOutputTokens > 0
        ? req.maxOutputTokens
        : input.defaultMaxOutputTokens;

    const effort = mapReasoningEffortToOutputConfigEffort(req.reasoningEffort);
    const outputConfig: Anthropic.Messages.OutputConfig = {};
    if (effort) {
      outputConfig.effort = effort;
    }
    if (req.textFormat.type === "json_schema") {
      outputConfig.format = {
        type: "json_schema",
        schema: req.textFormat.schema,
      };
    }

    const params: Anthropic.Messages.MessageCreateParamsNonStreaming = {
      model: req.model || input.model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: userBlocks }],
      ...(req.userOnly
        ? {}
        : req.systemPrompt
          ? { system: req.systemPrompt }
          : {}),
      ...(Object.keys(outputConfig).length > 0 ? { output_config: outputConfig } : {}),
      ...(req.temperature != null ? { temperature: req.temperature } : {}),
    };

    let response: Anthropic.Messages.Message;
    try {
      response = await createMessage(params);
    } catch (error) {
      const status = error instanceof Anthropic.APIError ? error.status : undefined;
      throw new ModelCallError("response_failed", status, formatAnthropicError(error));
    }

    if (response.stop_reason === "refusal") {
      throw new ModelCallError("refused", undefined, "ANTHROPIC_REFUSED");
    }
    if (response.stop_reason === "max_tokens") {
      throw new ModelCallError("truncated", undefined, "ANTHROPIC_TRUNCATED");
    }

    const rawText = extractTextContent(response.content);
    if (!rawText) {
      return { outputText: null, usage: mapAnthropicUsage(response.usage) };
    }

    if (req.textFormat.type === "json_object") {
      return {
        outputText: parseJsonObjectOutput(rawText),
        usage: mapAnthropicUsage(response.usage),
      };
    }

    try {
      const parsed = JSON.parse(rawText) as unknown;
      const normalized = normalizeJsonEnumCasing(parsed, req.textFormat.schema);
      return {
        outputText: JSON.stringify(normalized),
        usage: mapAnthropicUsage(response.usage),
      };
    } catch {
      return {
        outputText: rawText,
        usage: mapAnthropicUsage(response.usage),
      };
    }
  };
}
