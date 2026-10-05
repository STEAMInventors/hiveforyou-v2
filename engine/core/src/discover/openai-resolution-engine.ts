import { HIVE_DISCOVER_RESOLUTION_JSON_SCHEMA } from "@hiveforyou/shared/discover";
import type { HiveDiscoverResolutionProposalV1 } from "@hiveforyou/shared/discover";
import { HIVE_DISCOVER_RESOLUTION_SCHEMA } from "@hiveforyou/shared/discover";

import type { CallModel } from "../model/call-model";

import type { DiscoverResolutionContext, DiscoverResolutionEngine } from "./engine";

type OpenAIResolutionEngineOptions = {
  model: string;
  reasoningEffort: string;
  callModel: CallModel;
};

export class OpenAIDiscoverResolutionEngine implements DiscoverResolutionEngine {
  constructor(private readonly options: OpenAIResolutionEngineOptions) {}

  async resolveDiscovery(
    context: DiscoverResolutionContext,
  ): Promise<HiveDiscoverResolutionProposalV1> {
    const bytesById = context.sourceDocumentBytes ?? new Map<string, Uint8Array>();
    const attachments = context.sourceDocuments.map((source) => {
      const bytes = bytesById.get(source.sourceDocumentId);
      if (!bytes) {
        throw new Error("MISSING_SOURCE_DOCUMENT_BYTES");
      }
      return {
        filename: source.originalFilename,
        bytes,
        mimeType: source.mimeType,
      };
    });

    const userText = [
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
    ].join("\n");

    const response = await this.options.callModel({
      model: this.options.model,
      reasoningEffort: this.options.reasoningEffort,
      userContent: userText,
      attachments,
      userOnly: true,
      textFormat: {
        type: "json_schema",
        name: "hive_discover_resolution",
        strict: true,
        schema: HIVE_DISCOVER_RESOLUTION_JSON_SCHEMA,
      },
    });

    const outputText = response.outputText;
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
