export type StoryModelJsonSchemaFormat = {
  type: "json_schema";
  name: string;
  strict: boolean;
  schema: Record<string, unknown>;
};

/** Provider-neutral request for the optional story writer model call. */
export type ModelRequest = {
  model: string;
  temperature: number;
  systemPrompt: string;
  userContent: string;
  textFormat: StoryModelJsonSchemaFormat;
};

export type ModelResponse = {
  outputText: string | null;
  usage?: unknown;
};

export type CallModel = (req: ModelRequest) => Promise<ModelResponse>;
