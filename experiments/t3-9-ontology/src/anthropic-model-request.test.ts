import { describe, expect, it } from "vitest";

import {
  buildAnthropicMessagesCreateRequest,
  buildExperimentModelRequest,
  experimentBudgetMetadata,
} from "./anthropic-model-request.js";

describe("buildAnthropicMessagesCreateRequest", () => {
  it("does not include temperature for claude-opus-5-5", () => {
    const request = buildAnthropicMessagesCreateRequest({
      modelName: "claude-opus-5-5",
      maxOutputTokens: 16_000,
      systemPrompt: "system",
      userContent: "user",
      temperature: 0,
    });

    expect(Object.prototype.hasOwnProperty.call(request, "temperature")).toBe(false);
    expect(request.model).toBe("claude-opus-5-5");
  });

  it("includes temperature for other Anthropic models when provided", () => {
    const request = buildAnthropicMessagesCreateRequest({
      modelName: "claude-sonnet-4-20250514",
      maxOutputTokens: 16_000,
      userContent: "user",
      temperature: 0,
    });

    expect(request.temperature).toBe(0);
  });
});

describe("buildExperimentModelRequest", () => {
  it("omits temperature on ModelRequest for claude-opus-5-5", () => {
    const request = buildExperimentModelRequest({
      provider: "anthropic",
      model: "claude-opus-5-5",
      userContent: "hello",
      textFormat: { type: "json_object" },
    });

    expect(Object.prototype.hasOwnProperty.call(request, "temperature")).toBe(false);
  });

  it("keeps temperature for OpenAI", () => {
    const request = buildExperimentModelRequest({
      provider: "openai",
      model: "gpt-5.6-sol",
      userContent: "hello",
      textFormat: { type: "json_object" },
    });

    expect(request.temperature).toBe(0);
  });
});

describe("experimentBudgetMetadata", () => {
  it("reports temperature as omitted for claude-opus-5-5", () => {
    expect(experimentBudgetMetadata("anthropic", "claude-opus-5-5").temperature).toBe("omitted");
  });

  it("reports numeric temperature for OpenAI", () => {
    expect(experimentBudgetMetadata("openai", "gpt-5.6-sol").temperature).toBe(0);
  });
});
