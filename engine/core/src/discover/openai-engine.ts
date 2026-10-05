import {
  HIVE_DISCOVER_PROPOSAL_JSON_SCHEMA,
  HIVE_DISCOVER_PROPOSAL_V2_JSON_SCHEMA,
} from "@hiveforyou/shared/discover";
import type { DiscoverProposalOutput } from "./engine";
import {
  HIVE_DISCOVER_PROPOSAL_SCHEMA,
  HIVE_DISCOVER_PROPOSAL_SCHEMA_V2,
} from "@hiveforyou/shared/discover";

import type { CallModel } from "../model/call-model";

import type { DiscoverEngine, DiscoverEngineContext } from "./engine";

export type OpenAIDiscoverEngineOptions = {
  model: string;
  reasoningEffort: string;
  callModel: CallModel;
};

function parseProposal(text: string, expectedSchema: string): DiscoverProposalOutput {
  const parsed = JSON.parse(text) as unknown;
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("MALFORMED_PROPOSAL");
  }
  const schemaVersion = (parsed as { schemaVersion?: string }).schemaVersion;
  if (schemaVersion !== expectedSchema) {
    throw new Error("MALFORMED_PROPOSAL");
  }
  return parsed as DiscoverProposalOutput;
}

export class OpenAIDiscoverEngine implements DiscoverEngine {
  constructor(private readonly options: OpenAIDiscoverEngineOptions) {}

  async discover(context: DiscoverEngineContext): Promise<DiscoverProposalOutput> {
    const isV2 = context.composed.outputSchema === HIVE_DISCOVER_PROPOSAL_SCHEMA_V2;
    const schema = isV2
      ? HIVE_DISCOVER_PROPOSAL_V2_JSON_SCHEMA
      : HIVE_DISCOVER_PROPOSAL_JSON_SCHEMA;
    const schemaVersion = isV2 ? HIVE_DISCOVER_PROPOSAL_SCHEMA_V2 : HIVE_DISCOVER_PROPOSAL_SCHEMA;
    const schemaName = isV2 ? "hive_discover_proposal_v2" : "hive_discover_proposal";
    const instruction = isV2
      ? "Examine the attached files and return a hive-discover-proposal/2 JSON object."
      : "Examine the attached files and return a hive-discover-proposal/1 JSON object.";
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

    const phaseBlock = context.composed.discoveryPhase
      ? [`Discovery phase: ${context.composed.discoveryPhase}`, ""]
      : [];
    const objectiveBlock = context.composed.customerObjective
      ? [
          "Customer objective (CUSTOMER_ASSERTION — guides emphasis only):",
          context.composed.customerObjective,
          "",
        ]
      : [];
    const priorBlock = context.composed.priorCollectionProposalJson
      ? [
          "Prior collection understanding proposal (JSON):",
          context.composed.priorCollectionProposalJson,
          "",
        ]
      : [];

    const userText = [
      ...phaseBlock,
      ...objectiveBlock,
      ...priorBlock,
      "Domain Pack vocabulary (JSON):",
      context.composed.domainPackVocabulary,
      "",
      "Source document metadata (JSON):",
      JSON.stringify(context.composed.sourceDocuments, null, 2),
      "",
      instruction,
    ].join("\n");

    const response = await this.options.callModel({
      model: this.options.model,
      reasoningEffort: this.options.reasoningEffort,
      systemPrompt: context.composed.system,
      userContent: userText,
      attachments,
      textFormat: {
        type: "json_schema",
        name: schemaName,
        strict: true,
        schema,
      },
    });

    const outputText = response.outputText;
    if (!outputText) {
      throw new Error("MALFORMED_PROPOSAL");
    }
    return parseProposal(outputText, schemaVersion);
  }
}
