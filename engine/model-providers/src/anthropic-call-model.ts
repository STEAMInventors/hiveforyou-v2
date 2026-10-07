import Anthropic from "@anthropic-ai/sdk";
import type { CallModel, ModelFileAttachment, ModelRequest } from "@hiveforyou/shared/model/call-model";
import { ModelCallError } from "@hiveforyou/shared/model/call-model";

import { resolveAnthropicSchemaMode } from "./anthropic-schema-mode";
import { extractFirstJsonObject } from "./extract-first-json-object";
import { normalizeJsonEnumCasing } from "./normalize-schema-enum-casing";
import { sanitizeSchemaForAnthropic } from "./sanitize-schema-for-anthropic";

const PROMPT_MODE_SCHEMA_INSTRUCTION =
  "Return only one JSON object that matches this JSON Schema:";

const ANTHROPIC_EFFORT_LEVELS = new Set(["low", "medium", "high", "xhigh", "max"]);

export type AnthropicCallModelOptions = {
  apiKey: string;
  model: string;
  defaultMaxOutputTokens: number;
  workspaceId?: string;
  /** Test hook: replaces `messages.stream(...).finalMessage()`. */
  streamFinalMessage?: (
    params: Anthropic.Messages.MessageCreateParamsNonStreaming,
  ) => Promise<Anthropic.Messages.Message>;
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

const EPHEMERAL_CACHE_CONTROL = { type: "ephemeral" as const };

function attachmentToContentBlock(
  attachment: ModelFileAttachment,
  withCacheBreakpoint?: boolean,
): Anthropic.Messages.ContentBlockParam {
  const mime = normalizeMimeType(attachment.mimeType);
  const data = bytesToBase64(attachment.bytes);
  const cacheControl = withCacheBreakpoint ? EPHEMERAL_CACHE_CONTROL : undefined;

  if (mime === "application/pdf") {
    return {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data,
      },
      ...(cacheControl ? { cache_control: cacheControl } : {}),
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
      ...(cacheControl ? { cache_control: cacheControl } : {}),
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

function mapAnthropicUsage(usage: Anthropic.Messages.Usage | undefined):
  | {
      inputTokens: number;
      outputTokens: number;
      cacheReadInputTokens: number;
      cacheWriteInputTokens: number;
    }
  | undefined {
  if (!usage) {
    return undefined;
  }
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteInputTokens: usage.cache_creation_input_tokens ?? 0,
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
  if (error instanceof Error) {
    const statusValue = (error as unknown as { status?: unknown }).status;
    const status = typeof statusValue === "number" ? statusValue : "unknown";
    return `ANTHROPIC_RESPONSE_FAILED:${status} message=${error.message}`;
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

function parsePromptModeJsonOutput(text: string): string {
  try {
    const jsonSlice = extractFirstJsonObject(text);
    const parsed = JSON.parse(jsonSlice) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ModelCallError("response_failed", undefined, "ANTHROPIC_PROMPT_JSON_NOT_OBJECT");
    }
    return JSON.stringify(parsed);
  } catch (error) {
    if (error instanceof ModelCallError) {
      throw error;
    }
    throw new ModelCallError("response_failed", undefined, "ANTHROPIC_PROMPT_JSON_PARSE_FAILED");
  }
}

function buildPromptModeSystemPrompt(
  baseSystem: string | undefined,
  schema: Record<string, unknown>,
): string {
  const schemaText = JSON.stringify(schema, null, 2);
  const block = `${PROMPT_MODE_SCHEMA_INSTRUCTION}\n${schemaText}`;
  return baseSystem?.trim() ? `${baseSystem.trim()}\n\n${block}` : block;
}

/** Host-side Anthropic adapter for {@link CallModel}. */
export function createAnthropicCallModel(input: AnthropicCallModelOptions): CallModel {
  const workspaceId = input.workspaceId?.trim();
  const client = new Anthropic({
    apiKey: input.apiKey,
    ...(workspaceId
      ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } }
      : {}),
  });
  const streamFinalMessage =
    input.streamFinalMessage ??
    (async (params: Anthropic.Messages.MessageCreateParamsNonStreaming) =>
      client.messages.stream(params).finalMessage());

  return async (req: ModelRequest) => {
    const attachments = req.attachments ?? [];
    const lastAttachmentIndex = attachments.length - 1;
    const userBlocks: Anthropic.Messages.ContentBlockParam[] = [
      ...attachments.map((attachment, index) =>
        attachmentToContentBlock(attachment, index === lastAttachmentIndex && lastAttachmentIndex >= 0),
      ),
      { type: "text", text: req.userContent },
    ];

    const maxTokens =
      req.maxOutputTokens != null && req.maxOutputTokens > 0
        ? req.maxOutputTokens
        : input.defaultMaxOutputTokens;

    const jsonSchemaMode =
      req.textFormat.type === "json_schema"
        ? resolveAnthropicSchemaMode(req.textFormat.name)
        : null;

    const effort = mapReasoningEffortToOutputConfigEffort(req.reasoningEffort);
    const outputConfig: Anthropic.Messages.OutputConfig = {};
    if (effort && jsonSchemaMode !== "prompt") {
      outputConfig.effort = effort;
    }
    if (req.textFormat.type === "json_schema" && jsonSchemaMode === "constrained") {
      outputConfig.format = {
        type: "json_schema",
        schema: sanitizeSchemaForAnthropic(req.textFormat.schema),
      };
    }

    const systemForRequest =
      req.textFormat.type === "json_schema" && jsonSchemaMode === "prompt" && !req.userOnly
        ? buildPromptModeSystemPrompt(req.systemPrompt, req.textFormat.schema)
        : req.systemPrompt;

    const params: Anthropic.Messages.MessageCreateParamsNonStreaming = {
      model: req.model || input.model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: userBlocks }],
      ...(req.userOnly
        ? {}
        : systemForRequest
          ? {
              system: [
                {
                  type: "text",
                  text: systemForRequest,
                  cache_control: EPHEMERAL_CACHE_CONTROL,
                },
              ],
            }
          : {}),
      ...(Object.keys(outputConfig).length > 0 ? { output_config: outputConfig } : {}),
      ...(req.temperature != null ? { temperature: req.temperature } : {}),
    };

    let response: Anthropic.Messages.Message;
    try {
      response = await streamFinalMessage(params);
    } catch (error) {
      const statusRaw = error instanceof Error ? (error as unknown as { status?: unknown }).status : undefined;
      const status = typeof statusRaw === "number" ? statusRaw : undefined;
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

    if (jsonSchemaMode === "prompt") {
      const outputText = parsePromptModeJsonOutput(rawText);
      const parsed = JSON.parse(outputText) as unknown;
      const normalized = normalizeJsonEnumCasing(parsed, req.textFormat.schema);
      return {
        outputText: JSON.stringify(normalized),
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
