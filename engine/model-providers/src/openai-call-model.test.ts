import { OpenAIDiscoverEngine } from "@hiveforyou/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ModelCallError } from "@hiveforyou/shared/model/call-model";

import { createCallModelFromEnv } from "./create-call-model-from-env.js";
import {
  buildOpenAIInlineInputFilePart,
  createOpenAICallModel,
  extractOpenAIResponseErrorFields,
  extractOpenAIResponseOutputText,
  formatOpenAIResponseFailedErrorMessage,
} from "./openai-call-model.js";

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

  it("logs tier-1 atom failures with the hive-atoms label", async () => {
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
            code: "invalid_json_schema",
            param: "text.format.schema",
            message: "Missing 'appliesFrom'",
          },
        }),
      })),
    );

    const callModel = createOpenAICallModel({ apiKey: "test-key" });
    await expect(
      callModel({
        model: "gpt-test",
        userContent: "section",
        logLabel: "hive-atoms",
        textFormat: {
          type: "json_schema",
          name: "atom_prose_statements",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {},
            required: [],
          },
        },
      }),
    ).rejects.toThrow("invalid_json_schema");

    expect(errorSpy).toHaveBeenCalledWith(
      "[hive-atoms/openai] OpenAI Responses API request failed",
      expect.objectContaining({
        httpStatus: 400,
        openAIErrorCode: "invalid_json_schema",
      }),
    );
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

describe("OpenAI PDF attachments", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("buildOpenAIInlineInputFilePart encodes PDF as data URI without file_id", () => {
    const part = buildOpenAIInlineInputFilePart({
      filename: "iep.pdf",
      bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      mimeType: "application/pdf",
    });
    expect(part).toEqual({
      type: "input_file",
      filename: "iep.pdf",
      file_data: "data:application/pdf;base64,JVBERg==",
    });
    expect(part).not.toHaveProperty("file_id");
  });

  it("inline delivery sends multiple PDFs in attachment order and skips /v1/files", async () => {
    const uploadFile = vi.fn();
    let capturedBody: Record<string, unknown> | undefined;
    const createResponse = vi.fn(async (params: { body: unknown }) => {
      capturedBody = params.body as Record<string, unknown>;
      return { output_text: "{}" };
    });

    const callModel = createOpenAICallModel({
      apiKey: "proxy-key",
      responsesUrl: "https://litellm.example/v1/responses",
      attachmentDelivery: "inline",
      uploadFile,
      createResponse,
    });

    await callModel({
      model: "MODEL_HEAVY_LIFTER",
      userContent: "study these",
      attachments: [
        {
          filename: "first.pdf",
          bytes: new Uint8Array([1]),
          mimeType: "application/pdf",
        },
        {
          filename: "second.pdf",
          bytes: new Uint8Array([2]),
          mimeType: "application/pdf",
        },
      ],
      textFormat: { type: "json_object" },
    });

    expect(uploadFile).not.toHaveBeenCalled();
    const input = capturedBody?.input as Array<{ role: string; content: unknown[] }>;
    const userContent = input[0]?.content as Array<Record<string, unknown>>;
    expect(userContent[0]).toEqual({ type: "input_text", text: "study these" });
    expect(userContent[1]).toMatchObject({ type: "input_file", filename: "first.pdf" });
    expect(userContent[2]).toMatchObject({ type: "input_file", filename: "second.pdf" });
    expect(String(userContent[1]?.file_data)).toMatch(/^data:application\/pdf;base64,/);
  });

  it("upload delivery still uses file_id when attachmentDelivery is upload", async () => {
    const uploadFile = vi.fn(async () => "file-abc");
    let capturedBody: Record<string, unknown> | undefined;
    const createResponse = vi.fn(async (params: { body: unknown }) => {
      capturedBody = params.body as Record<string, unknown>;
      return { output_text: "{}" };
    });

    const callModel = createOpenAICallModel({
      apiKey: "sk-direct",
      attachmentDelivery: "upload",
      uploadFile,
      createResponse,
    });

    await callModel({
      model: "gpt-test",
      userContent: "prompt",
      attachments: [{ filename: "doc.pdf", bytes: new Uint8Array([9]), mimeType: "application/pdf" }],
      textFormat: { type: "json_object" },
    });

    expect(uploadFile).toHaveBeenCalledOnce();
    const input = capturedBody?.input as Array<{ content: unknown[] }>;
    const userContent = input[0]?.content as Array<Record<string, unknown>>;
    expect(userContent[1]).toEqual({ type: "input_file", file_id: "file-abc" });
  });

  it("surfaces LiteLLM gateway errors from Responses without attempting file upload", async () => {
    const uploadFile = vi.fn();
    const createResponse = vi.fn(async () => {
      throw new ModelCallError(
        "response_failed",
        502,
        "OPENAI_RESPONSE_FAILED:502 message=bad gateway",
      );
    });

    const callModel = createOpenAICallModel({
      apiKey: "proxy-key",
      attachmentDelivery: "inline",
      uploadFile,
      createResponse,
    });

    await expect(
      callModel({
        model: "MODEL_HEAVY_LIFTER",
        userContent: "study",
        attachments: [{ filename: "doc.pdf", bytes: new Uint8Array([1]), mimeType: "application/pdf" }],
        textFormat: { type: "json_object" },
      }),
    ).rejects.toThrow("OPENAI_RESPONSE_FAILED:502");

    expect(uploadFile).not.toHaveBeenCalled();
  });
});

describe("createCallModelFromEnv LiteLLM OpenAI routing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("routes PDFs inline through the LiteLLM proxy without calling api.openai.com", async () => {
    const fetchUrls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        fetchUrls.push(url);
        if (url.includes("/responses")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ output_text: '{"ok":true}' }),
          };
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const bundle = createCallModelFromEnv({
      MODEL_PROVIDER: "openai",
      LITELLM_BASE_URL: "https://litellm.example/v1",
      LITELLM_API_KEY: "litellm-key",
      MODEL_NAME: "MODEL_HEAVY_LIFTER",
    });

    await bundle.callModel({
      model: bundle.modelName,
      userContent: "canonical study",
      attachments: [{ filename: "a.pdf", bytes: new Uint8Array([0x25]), mimeType: "application/pdf" }],
      textFormat: { type: "json_object" },
    });

    expect(fetchUrls).toEqual(["https://litellm.example/v1/responses"]);
    expect(fetchUrls.some((url) => url.includes("api.openai.com"))).toBe(false);
    expect(fetchUrls.some((url) => url.includes("/files"))).toBe(false);
  });
});
