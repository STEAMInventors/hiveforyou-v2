import { HIVE_DISCOVER_RESOLUTION_JSON_SCHEMA } from "@hiveforyou/shared/discover";
import type { HiveDiscoverResolutionProposalV1 } from "@hiveforyou/shared/discover";
import { HIVE_DISCOVER_RESOLUTION_SCHEMA } from "@hiveforyou/shared/discover";

import type { DiscoverResolutionContext, DiscoverResolutionEngine } from "./engine";
import {
  defaultOpenAICreateResponse,
  defaultOpenAIUploadFile,
  extractOpenAIResponseErrorFields,
  formatOpenAIResponseFailedErrorMessage,
} from "./openai-engine";

type OpenAIResolutionEngineOptions = {
  apiKey: string;
  model: string;
  reasoningEffort: string;
  fetchImpl?: typeof fetch;
  uploadFile?: (input: {
    apiKey: string;
    filename: string;
    bytes: Uint8Array;
    mimeType?: string | null;
  }) => Promise<string>;
  createResponse?: (input: {
    apiKey: string;
    model: string;
    reasoningEffort: string;
    body: unknown;
  }) => Promise<unknown>;
};

function extractOutputText(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.output_text === "string") {
    return record.output_text;
  }
  return null;
}

export class OpenAIDiscoverResolutionEngine implements DiscoverResolutionEngine {
  private readonly uploadFile: NonNullable<OpenAIResolutionEngineOptions["uploadFile"]>;
  private readonly createResponse: NonNullable<OpenAIResolutionEngineOptions["createResponse"]>;

  constructor(private readonly options: OpenAIResolutionEngineOptions) {
    this.uploadFile = options.uploadFile ?? defaultOpenAIUploadFile;
    this.createResponse = options.createResponse ?? defaultOpenAICreateResponse;
  }

  async resolveDiscovery(
    context: DiscoverResolutionContext,
  ): Promise<HiveDiscoverResolutionProposalV1> {
    const bytesById = context.sourceDocumentBytes ?? new Map<string, Uint8Array>();
    const uploadFile = this.uploadFile;
    const createResponse = this.createResponse;

    const fileIds: string[] = [];
    for (const source of context.sourceDocuments) {
      const bytes = bytesById.get(source.sourceDocumentId);
      if (!bytes) {
        throw new Error("MISSING_SOURCE_DOCUMENT_BYTES");
      }
      const fileId = await uploadFile({
        apiKey: this.options.apiKey,
        filename: source.originalFilename,
        bytes,
        mimeType: source.mimeType,
      });
      fileIds.push(fileId);
    }

    const userContent: Array<Record<string, unknown>> = [
      {
        type: "input_text",
        text: [
          context.resolutionPrompt,
          "",
          "Prior validated discovery proposal (JSON):",
          JSON.stringify(context.priorProposal, null, 2),
          "",
          "Customer objective (CUSTOMER_ASSERTION):",
          context.customerObjective,
          "",
          "Prior discovery clarification questions (JSON):",
          JSON.stringify(
            context.discoverQuestions.filter((q) => q.questionKey !== "discovery.objective"),
            null,
            2,
          ),
          "",
          "Customer assertions for clarification (JSON):",
          JSON.stringify(
            context.customerAnswers.filter((answer) => {
              const question = context.discoverQuestions.find((q) => q.id === answer.questionId);
              return question && question.questionKey !== "discovery.objective";
            }),
            null,
            2,
          ),
          "",
          "Return hive-discover-resolution/1 JSON.",
        ].join("\n"),
      },
      ...fileIds.map((fileId) => ({ type: "input_file", file_id: fileId })),
    ];

    const body = {
      model: this.options.model,
      reasoning: { effort: this.options.reasoningEffort },
      input: [
        {
          role: "user",
          content: userContent,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "hive_discover_resolution",
          strict: true,
          schema: HIVE_DISCOVER_RESOLUTION_JSON_SCHEMA,
        },
      },
    };

    const responsePayload = await createResponse({
      apiKey: this.options.apiKey,
      model: this.options.model,
      reasoningEffort: this.options.reasoningEffort,
      body,
    });

    const outputText = extractOutputText(responsePayload);
    if (!outputText) {
      throw new Error("MALFORMED_PROPOSAL");
    }
    const parsed = JSON.parse(outputText) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as { schemaVersion?: string }).schemaVersion !== HIVE_DISCOVER_RESOLUTION_SCHEMA
    ) {
      throw new Error("MALFORMED_PROPOSAL");
    }
    return parsed as HiveDiscoverResolutionProposalV1;
  }
}

export { extractOpenAIResponseErrorFields, formatOpenAIResponseFailedErrorMessage };
