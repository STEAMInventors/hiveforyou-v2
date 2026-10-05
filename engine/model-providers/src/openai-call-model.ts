import type { CallModel, ModelRequest } from "@hiveforyou/shared/model/call-model";
import { ModelCallError } from "@hiveforyou/shared/model/call-model";

export type OpenAIResponseErrorFields = {
  type?: string;
  code?: string;
  param?: string;
  message?: string;
};

const OPENAI_ERROR_MESSAGE_MAX_LENGTH = 500;

export function extractOpenAIResponseErrorFields(payload: unknown): OpenAIResponseErrorFields {
  if (typeof payload !== "object" || payload === null) {
    return {};
  }
  const error = (payload as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) {
    return {};
  }
  const record = error as Record<string, unknown>;
  const message =
    typeof record.message === "string"
      ? record.message.trim().slice(0, OPENAI_ERROR_MESSAGE_MAX_LENGTH)
      : undefined;
  return {
    type: typeof record.type === "string" ? record.type : undefined,
    code: typeof record.code === "string" ? record.code : undefined,
    param: typeof record.param === "string" ? record.param : undefined,
    message: message && message.length > 0 ? message : undefined,
  };
}

/** Safe for persistence in discover_runs.error_message_safe (no request/secret payload). */
export function formatOpenAIResponseFailedErrorMessage(
  httpStatus: number,
  fields: OpenAIResponseErrorFields,
): string {
  const parts = [`OPENAI_RESPONSE_FAILED:${httpStatus}`];
  if (fields.type) {
    parts.push(`type=${fields.type}`);
  }
  if (fields.code) {
    parts.push(`code=${fields.code}`);
  }
  if (fields.param) {
    parts.push(`param=${fields.param}`);
  }
  if (fields.message) {
    parts.push(`message=${fields.message}`);
  }
  return parts.join(" ");
}

function logOpenAIResponseErrorDiagnostic(
  httpStatus: number,
  fields: OpenAIResponseErrorFields,
): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }
  console.error("[hive-discover/openai] OpenAI Responses API request failed", {
    httpStatus,
    openAIErrorType: fields.type ?? null,
    openAIErrorCode: fields.code ?? null,
    openAIErrorParam: fields.param ?? null,
    openAIErrorMessage: fields.message ?? null,
  });
}

export type OpenAICallModelOptions = {
  apiKey: string;
  uploadFile?: typeof defaultOpenAIUploadFile;
  createResponse?: typeof defaultOpenAICreateResponse;
};

export async function defaultOpenAIUploadFile(input: {
  apiKey: string;
  filename: string;
  bytes: Uint8Array;
  mimeType?: string | null;
}): Promise<string> {
  const form = new FormData();
  form.append("purpose", "user_data");
  const fileBytes = new Uint8Array(input.bytes);
  form.append(
    "file",
    new Blob([fileBytes], { type: input.mimeType || "application/octet-stream" }),
    input.filename,
  );
  const response = await fetch("https://api.openai.com/v1/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
    },
    body: form,
  });
  if (!response.ok) {
    throw new ModelCallError(
      "upload_failed",
      response.status,
      `OPENAI_FILE_UPLOAD_FAILED:${response.status}`,
    );
  }
  const payload = (await response.json()) as { id?: string };
  if (!payload.id) {
    throw new ModelCallError("upload_failed", undefined, "OPENAI_FILE_UPLOAD_FAILED:missing_id");
  }
  return payload.id;
}

export async function defaultOpenAICreateResponse(input: {
  apiKey: string;
  model: string;
  reasoningEffort: string;
  body: unknown;
}): Promise<unknown> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input.body),
  });
  if (!response.ok) {
    let fields: OpenAIResponseErrorFields = {};
    try {
      fields = extractOpenAIResponseErrorFields(await response.json());
    } catch {
      // Ignore non-JSON error bodies; status-only message is still persisted.
    }
    logOpenAIResponseErrorDiagnostic(response.status, fields);
    throw new ModelCallError(
      "response_failed",
      response.status,
      formatOpenAIResponseFailedErrorMessage(response.status, fields),
    );
  }
  return response.json();
}

/** Reads JSON/text from a Responses API payload (top-level or nested output). */
export function extractOpenAIResponseOutputText(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.output_text === "string") {
    return record.output_text;
  }
  const output = record.output;
  if (!Array.isArray(output)) {
    return null;
  }
  for (const item of output) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const message = item as Record<string, unknown>;
    if (message.type !== "message") {
      continue;
    }
    const content = message.content;
    if (!Array.isArray(content)) {
      continue;
    }
    for (const part of content) {
      if (typeof part !== "object" || part === null) {
        continue;
      }
      const piece = part as Record<string, unknown>;
      if (piece.type === "output_text" && typeof piece.text === "string") {
        return piece.text;
      }
    }
  }
  return null;
}

/** Host-side OpenAI adapter for {@link CallModel}. */
export function createOpenAICallModel(input: OpenAICallModelOptions): CallModel {
  const uploadFile = input.uploadFile ?? defaultOpenAIUploadFile;
  const createResponse = input.createResponse ?? defaultOpenAICreateResponse;

  return async (req: ModelRequest) => {
    const fileIds: string[] = [];
    for (const attachment of req.attachments ?? []) {
      const fileId = await uploadFile({
        apiKey: input.apiKey,
        filename: attachment.filename,
        bytes: attachment.bytes,
        mimeType: attachment.mimeType,
      });
      fileIds.push(fileId);
    }

    const userParts: Array<Record<string, unknown>> = [
      { type: "input_text", text: req.userContent },
      ...fileIds.map((fileId) => ({ type: "input_file", file_id: fileId })),
    ];

    const inputMessages: Array<Record<string, unknown>> = req.userOnly
      ? [{ role: "user", content: userParts }]
      : [
          ...(req.systemPrompt
            ? [{ role: "system", content: [{ type: "input_text", text: req.systemPrompt }] }]
            : []),
          { role: "user", content: userParts },
        ];

    const body: Record<string, unknown> = {
      model: req.model,
      input: inputMessages,
      text: { format: req.textFormat },
    };
    if (req.reasoningEffort) {
      body.reasoning = { effort: req.reasoningEffort };
    }
    if (req.temperature != null) {
      body.temperature = req.temperature;
    }
    if (req.maxOutputTokens != null && req.maxOutputTokens > 0) {
      body.max_output_tokens = req.maxOutputTokens;
    }

    const responsePayload = await createResponse({
      apiKey: input.apiKey,
      model: req.model,
      reasoningEffort: req.reasoningEffort ?? "medium",
      body,
    });

    const usage =
      typeof responsePayload === "object" && responsePayload !== null
        ? (responsePayload as { usage?: unknown }).usage
        : undefined;

    return {
      outputText: extractOpenAIResponseOutputText(responsePayload),
      usage,
    };
  };
}
