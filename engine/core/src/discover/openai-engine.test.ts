import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createOpenAICallModel,
  extractOpenAIResponseErrorFields,
  extractOpenAIResponseOutputText,
  formatOpenAIResponseFailedErrorMessage,
  OpenAIDiscoverEngine,
} from "./openai-engine";

describe("OpenAI Responses API error diagnostics", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("extracts OpenAI error fields from a JSON error body", () => {
    const fields = extractOpenAIResponseErrorFields({
      error: {
        type: "invalid_request_error",
        code: "invalid_schema",
        param: "text.format.schema",
        message: "Invalid schema for response format.",
      },
    });
    expect(fields).toEqual({
      type: "invalid_request_error",
      code: "invalid_schema",
      param: "text.format.schema",
      message: "Invalid schema for response format.",
    });
  });

  it("formats a safe persisted error message without request payload", () => {
    const message = formatOpenAIResponseFailedErrorMessage(400, {
      type: "invalid_request_error",
      code: "invalid_schema",
      param: "text.format.schema",
      message: "Invalid schema for response format.",
    });
    expect(message).toBe(
      "OPENAI_RESPONSE_FAILED:400 type=invalid_request_error code=invalid_schema param=text.format.schema message=Invalid schema for response format.",
    );
    expect(message).not.toContain("Bearer");
    expect(message).not.toContain("sk-");
  });

  it("logs sanitized fields in development when Responses API returns non-2xx", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            type: "invalid_request_error",
            code: "missing_required_parameter",
            param: "model",
            message: "you must provide a model parameter",
          },
        }),
      })),
    );

    const engine = new OpenAIDiscoverEngine({
      model: "gpt-test",
      reasoningEffort: "medium",
      callModel: createOpenAICallModel({ apiKey: "test-key" }),
    });

    await expect(
      engine.discover({
        composed: {
          system: "system",
          domainPackVocabulary: "{}",
          sourceDocuments: [],
        },
        sourceDocuments: [],
        sourceDocumentBytes: new Map(),
      }),
    ).rejects.toThrow(
      "OPENAI_RESPONSE_FAILED:400 type=invalid_request_error code=missing_required_parameter param=model message=you must provide a model parameter",
    );

    expect(errorSpy).toHaveBeenCalledWith(
      "[hive-discover/openai] OpenAI Responses API request failed",
      {
        httpStatus: 400,
        openAIErrorType: "invalid_request_error",
        openAIErrorCode: "missing_required_parameter",
        openAIErrorParam: "model",
        openAIErrorMessage: "you must provide a model parameter",
      },
    );
  });

  it("does not log in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({
          error: { type: "invalid_request_error", message: "bad request" },
        }),
      })),
    );

    const engine = new OpenAIDiscoverEngine({
      model: "gpt-test",
      reasoningEffort: "medium",
      callModel: createOpenAICallModel({ apiKey: "test-key" }),
    });

    await expect(
      engine.discover({
        composed: {
          system: "system",
          domainPackVocabulary: "{}",
          sourceDocuments: [],
        },
        sourceDocuments: [],
        sourceDocumentBytes: new Map(),
      }),
    ).rejects.toThrow(
      "OPENAI_RESPONSE_FAILED:400 type=invalid_request_error message=bad request",
    );

    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe("extractOpenAIResponseOutputText", () => {
  it("reads nested output_text when top-level output_text is absent", () => {
    const text = extractOpenAIResponseOutputText({
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: '{"paragraphs":[]}' }],
        },
      ],
    });
    expect(text).toBe('{"paragraphs":[]}');
  });
});
