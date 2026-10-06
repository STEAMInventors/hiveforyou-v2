export type ModelJsonSchemaFormat = {
  type: "json_schema";
  name: string;
  strict: boolean;
  schema: Record<string, unknown>;
};

export type ModelJsonObjectFormat = {
  type: "json_object";
};

export type ModelTextFormat = ModelJsonSchemaFormat | ModelJsonObjectFormat;

/** File bytes attached to the user turn (provider uploads and binds as document input). */
export type ModelFileAttachment = {
  filename: string;
  bytes: Uint8Array;
  mimeType?: string | null;
};

/** Provider-neutral model call request (Hive Core builds; host injects CallModel). */
export type ModelRequest = {
  model: string;
  temperature?: number;
  reasoningEffort?: string;
  maxOutputTokens?: number;
  systemPrompt?: string;
  userContent: string;
  attachments?: ModelFileAttachment[];
  /** When true, omit system role (e.g. discover resolution). */
  userOnly?: boolean;
  textFormat: ModelTextFormat;
  /**
   * Diagnostic prefix for provider error logs.
   * `"hive-atoms"` logs as `[hive-atoms/openai]`. Defaults to `hive-discover`.
   */
  logLabel?: string;
};

export type ModelResponse = {
  outputText: string | null;
  usage?: unknown;
};

export type CallModel = (req: ModelRequest) => Promise<ModelResponse>;

export type ModelCallErrorKind = "upload_failed" | "response_failed" | "refused" | "truncated";

export class ModelCallError extends Error {
  constructor(
    public kind: ModelCallErrorKind,
    public status: number | undefined,
    message: string,
  ) {
    super(message);
    this.name = "ModelCallError";
  }
}

/** @deprecated Use ModelJsonSchemaFormat */
export type StoryModelJsonSchemaFormat = ModelJsonSchemaFormat;
