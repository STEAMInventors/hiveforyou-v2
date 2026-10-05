import { describe, expect, it, vi } from "vitest";

import { ModelCallError } from "@hiveforyou/shared/model/call-model";

import {
  createAnthropicCallModel,
  type AnthropicCallModelOptions,
} from "./anthropic-call-model.js";
import { createCallModelFromEnv } from "./create-call-model-from-env.js";
import { normalizeJsonEnumCasing } from "./normalize-schema-enum-casing.js";

describe("createCallModelFromEnv", () => {
  it("throws when OPENAI_API_KEY is missing for openai provider", () => {
    expect(() =>
      createCallModelFromEnv({
        MODEL_PROVIDER: "openai",
        OPENAI_API_KEY: "",
      }),
    ).toThrow("OPENAI_API_KEY is required when MODEL_PROVIDER=openai");
  });

  it("throws when ANTHROPIC_API_KEY is missing for anthropic provider", () => {
    expect(() =>
      createCallModelFromEnv({
        MODEL_PROVIDER: "anthropic",
        ANTHROPIC_API_KEY: "",
      }),
    ).toThrow("ANTHROPIC_API_KEY is required when MODEL_PROVIDER=anthropic");
  });
});

describe("normalizeJsonEnumCasing", () => {
  it("normalizes enum strings case-insensitively", () => {
    const schema = {
      type: "object",
      properties: {
        status: { type: "string", enum: ["ACTIVE", "Pending"] },
      },
    };
    const normalized = normalizeJsonEnumCasing({ status: "active" }, schema);
    expect(normalized).toEqual({ status: "ACTIVE" });
  });
});

function mockCreateMessage(
  impl: AnthropicCallModelOptions["createMessage"],
): AnthropicCallModelOptions["createMessage"] {
  return impl!;
}

describe("createAnthropicCallModel", () => {
  it("maps json_schema requests with system prompt and output_config.format", async () => {
    const createMessage = vi.fn(async () => ({
      stop_reason: "end_turn",
      content: [{ type: "text", text: '{"ok":true}' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    }));

    const callModel = createAnthropicCallModel({
      apiKey: "test-key",
      model: "claude-opus-5-5",
      defaultMaxOutputTokens: 16000,
      createMessage: mockCreateMessage(createMessage),
    });

    await callModel({
      model: "claude-opus-5-5",
      systemPrompt: "system instructions",
      userContent: "hello",
      reasoningEffort: "medium",
      textFormat: {
        type: "json_schema",
        name: "test_schema",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: { ok: { type: "boolean" } },
          required: ["ok"],
        },
      },
    });

    expect(createMessage.mock.calls[0]?.[0]).toMatchSnapshot();
  });

  it("omits system when userOnly is true", async () => {
    const createMessage = vi.fn(async () => ({
      stop_reason: "end_turn",
      content: [{ type: "text", text: '{"ok":true}' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    }));

    const callModel = createAnthropicCallModel({
      apiKey: "test-key",
      model: "claude-opus-5-5",
      defaultMaxOutputTokens: 16000,
      createMessage: mockCreateMessage(createMessage),
    });

    await callModel({
      model: "claude-opus-5-5",
      systemPrompt: "ignored",
      userContent: "hello",
      userOnly: true,
      textFormat: {
        type: "json_schema",
        name: "test_schema",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: { ok: { type: "boolean" } },
          required: ["ok"],
        },
      },
    });

    expect(createMessage.mock.calls[0]?.[0].system).toBeUndefined();
  });

  it("maps json_object without output_config.format", async () => {
    const createMessage = vi.fn(async () => ({
      stop_reason: "end_turn",
      content: [{ type: "text", text: '{"a":1}' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    }));

    const callModel = createAnthropicCallModel({
      apiKey: "test-key",
      model: "claude-opus-5-5",
      defaultMaxOutputTokens: 16000,
      createMessage: mockCreateMessage(createMessage),
    });

    await callModel({
      model: "claude-opus-5-5",
      userContent: "hello",
      textFormat: { type: "json_object" },
    });

    expect(createMessage.mock.calls[0]?.[0].output_config?.format).toBeUndefined();
  });

  it("includes PDF document blocks before user text", async () => {
    const createMessage = vi.fn(async () => ({
      stop_reason: "end_turn",
      content: [{ type: "text", text: '{"ok":true}' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    }));

    const callModel = createAnthropicCallModel({
      apiKey: "test-key",
      model: "claude-opus-5-5",
      defaultMaxOutputTokens: 16000,
      createMessage: mockCreateMessage(createMessage),
    });

    await callModel({
      model: "claude-opus-5-5",
      userContent: "read this",
      attachments: [
        {
          filename: "doc.pdf",
          bytes: new Uint8Array([1, 2, 3]),
          mimeType: "application/pdf",
        },
      ],
      textFormat: { type: "json_object" },
    });

    const content = createMessage.mock.calls[0]?.[0].messages[0].content;
    expect(content).toMatchSnapshot();
  });

  it("maps stop_reason refusal to ModelCallError refused", async () => {
    const createMessage = vi.fn(async () => ({
      stop_reason: "refusal",
      content: [{ type: "text", text: "no" }],
      usage: { input_tokens: 1, output_tokens: 1 },
    }));

    const callModel = createAnthropicCallModel({
      apiKey: "test-key",
      model: "claude-opus-5-5",
      defaultMaxOutputTokens: 16000,
      createMessage: mockCreateMessage(createMessage),
    });

    await expect(
      callModel({
        model: "claude-opus-5-5",
        userContent: "hello",
        textFormat: { type: "json_object" },
      }),
    ).rejects.toMatchObject({ kind: "refused" });
  });

  it("maps stop_reason max_tokens to ModelCallError truncated", async () => {
    const createMessage = vi.fn(async () => ({
      stop_reason: "max_tokens",
      content: [{ type: "text", text: '{"partial":true}' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    }));

    const callModel = createAnthropicCallModel({
      apiKey: "test-key",
      model: "claude-opus-5-5",
      defaultMaxOutputTokens: 16000,
      createMessage: mockCreateMessage(createMessage),
    });

    await expect(
      callModel({
        model: "claude-opus-5-5",
        userContent: "hello",
        textFormat: { type: "json_object" },
      }),
    ).rejects.toMatchObject({ kind: "truncated" });
  });

  it("throws response_failed when json_object output is not parseable", async () => {
    const createMessage = vi.fn(async () => ({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "not json" }],
      usage: { input_tokens: 1, output_tokens: 1 },
    }));

    const callModel = createAnthropicCallModel({
      apiKey: "test-key",
      model: "claude-opus-5-5",
      defaultMaxOutputTokens: 16000,
      createMessage: mockCreateMessage(createMessage),
    });

    await expect(
      callModel({
        model: "claude-opus-5-5",
        userContent: "hello",
        textFormat: { type: "json_object" },
      }),
    ).rejects.toBeInstanceOf(ModelCallError);
  });

  it("normalizes enum casing in json_schema responses", async () => {
    const createMessage = vi.fn(async () => ({
      stop_reason: "end_turn",
      content: [{ type: "text", text: '{"status":"active"}' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    }));

    const callModel = createAnthropicCallModel({
      apiKey: "test-key",
      model: "claude-opus-5-5",
      defaultMaxOutputTokens: 16000,
      createMessage: mockCreateMessage(createMessage),
    });

    const response = await callModel({
      model: "claude-opus-5-5",
      userContent: "hello",
      textFormat: {
        type: "json_schema",
        name: "enum_test",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            status: { type: "string", enum: ["ACTIVE"] },
          },
          required: ["status"],
        },
      },
    });

    expect(JSON.parse(response.outputText ?? "")).toEqual({ status: "ACTIVE" });
  });
});
