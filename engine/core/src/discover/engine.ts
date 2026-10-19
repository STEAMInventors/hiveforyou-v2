import type {
  CustomerDiscoveryAnswer,
  DiscoverQuestion,
  HiveDiscoverProposalV1,
  HiveDiscoverProposalV2,
  HiveDiscoverResolutionProposalV1,
} from "@hiveforyou/shared/discover";
import { createCallModelFromOpenAIClient } from "@hiveforyou/shared/llm/call-model-from-openai-client";
import { getLLMRouter, resolveTierModelId } from "@hiveforyou/shared/llm/router";

import type { ComposedDiscoverPromptInputs } from "./compose-discover-prompt-inputs";
import { FixtureDiscoverEngine } from "./fixture-engine";
import { FixtureDiscoverResolutionEngine } from "./fixture-resolution-engine";
import { FixtureDiscoverV2Engine } from "./fixture-v2-engine";
import { OpenAIDiscoverEngine } from "./openai-engine";
import { OpenAIDiscoverResolutionEngine } from "./openai-resolution-engine";
import type { CallModel } from "../model/call-model";
import type { DiscoverSourceDocumentInput } from "./types";

import type { DiscoverEnginePhase } from "./types";

export type { DiscoverEnginePhase };

export type DiscoverEngineContext = {
  composed: ComposedDiscoverPromptInputs;
  sourceDocuments: DiscoverSourceDocumentInput[];
  /** Raw bytes keyed by sourceDocumentId — required for OpenAI file inputs. */
  sourceDocumentBytes?: Map<string, Uint8Array>;
  discoveryPhase?: DiscoverEnginePhase;
  priorCollectionProposal?: HiveDiscoverProposalV2;
};

export type DiscoverProposalOutput = HiveDiscoverProposalV1 | HiveDiscoverProposalV2;

export interface DiscoverEngine {
  discover(context: DiscoverEngineContext): Promise<DiscoverProposalOutput>;
}

export type DiscoverResolutionContext = {
  composed: ComposedDiscoverPromptInputs;
  priorProposal: HiveDiscoverProposalV2;
  discoverQuestions: DiscoverQuestion[];
  customerAnswers: CustomerDiscoveryAnswer[];
  customerObjective: string;
  sourceDocuments: DiscoverSourceDocumentInput[];
  sourceDocumentBytes?: Map<string, Uint8Array>;
  resolutionPrompt: string;
};

export interface DiscoverResolutionEngine {
  resolveDiscovery(
    context: DiscoverResolutionContext,
  ): Promise<HiveDiscoverResolutionProposalV1>;
}

export class UnconfiguredDiscoverEngine implements DiscoverEngine {
  async discover(): Promise<HiveDiscoverProposalV1> {
    throw new Error("DISCOVER_ENGINE_UNAVAILABLE");
  }
}

export type DiscoverEngineMode = "fixture" | "openai" | "unconfigured";

export type DiscoverEngineConfig = {
  engine: DiscoverEngine;
  mode: DiscoverEngineMode;
  providerId: string;
  modelId?: string;
  reasoningEffort?: string;
};

export type DiscoverEngineEnv = {
  engine?: string;
  openaiApiKey?: string;
  model?: string;
  reasoningEffort?: string;
};

export type OpenAIEngineFactory = (input: {
  model: string;
  reasoningEffort: string;
  callModel: CallModel;
}) => DiscoverEngine;

export type DiscoverEngineFactoryDeps = {
  createOpenAIEngine?: OpenAIEngineFactory;
  adaptiveV2?: boolean;
  /** Unit tests only; production uses sorter tier gateway. */
  callModel?: CallModel;
  /** Unit tests only; production uses sorter tier model id. */
  modelName?: string;
};

function resolveDiscoverSorterTier(deps: DiscoverEngineFactoryDeps): {
  callModel: CallModel;
  modelName: string;
} {
  const modelName = resolveTierModelId("sorter");
  if (deps.callModel) {
    return { callModel: deps.callModel, modelName };
  }
  const { client } = getLLMRouter("sorter");
  return {
    callModel: createCallModelFromOpenAIClient(client),
    modelName,
  };
}

export type DiscoverResolutionEngineConfig = {
  engine: DiscoverResolutionEngine;
  providerId: string;
  modelId?: string;
};

/**
 * Production composition must not default to fixture.
 * Explicit HIVE_DISCOVER_ENGINE=fixture for dev/test only.
 */
export function createDiscoverEngineFromEnv(
  env: DiscoverEngineEnv,
  deps: DiscoverEngineFactoryDeps = {},
): DiscoverEngineConfig {
  const normalized = env.engine?.trim().toLowerCase();
  if (normalized === "fixture") {
    return {
      engine: deps.adaptiveV2 ? new FixtureDiscoverV2Engine() : new FixtureDiscoverEngine(),
      mode: "fixture",
      providerId: "fixture-discover-engine",
      modelId: deps.adaptiveV2 ? "fixture-v2" : "fixture-v1",
    };
  }

  const reasoningEffort = env.reasoningEffort?.trim() || "medium";
  const hasInjectedModel = Boolean(deps.callModel && deps.modelName?.trim());
  const hasOpenAIKey = Boolean(
    process.env.LITELLM_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim(),
  );
  if (hasInjectedModel || hasOpenAIKey) {
    const sorter = resolveDiscoverSorterTier(deps);
    const factory = deps.createOpenAIEngine ?? ((input) => new OpenAIDiscoverEngine(input));
    return {
      engine: factory({
        model: sorter.modelName,
        reasoningEffort,
        callModel: sorter.callModel,
      }),
      mode: "openai",
      providerId: "openai-discover-engine",
      modelId: sorter.modelName,
      reasoningEffort,
    };
  }

  if (normalized === "openai") {
    const model = deps.modelName?.trim() || "gpt-5.6-sol";
    return {
      engine: new UnconfiguredDiscoverEngine(),
      mode: "openai",
      providerId: "openai-discover-engine",
      modelId: model,
      reasoningEffort,
    };
  }
  return {
    engine: new UnconfiguredDiscoverEngine(),
    mode: "unconfigured",
    providerId: "unconfigured",
  };
}

export function createDiscoverResolutionEngineFromEnv(
  env: DiscoverEngineEnv,
  deps: DiscoverEngineFactoryDeps = {},
): DiscoverResolutionEngineConfig {
  const normalized = env.engine?.trim().toLowerCase();
  if (normalized === "fixture") {
    return {
      engine: new FixtureDiscoverResolutionEngine(),
      providerId: "fixture-discover-resolution-engine",
      modelId: "fixture-v2",
    };
  }

  const reasoningEffort = env.reasoningEffort?.trim() || "medium";
  const hasInjectedModel = Boolean(deps.callModel && deps.modelName?.trim());
  const hasOpenAIKey = Boolean(
    process.env.LITELLM_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim(),
  );
  if (hasInjectedModel || hasOpenAIKey) {
    const sorter = resolveDiscoverSorterTier(deps);
    return {
      engine: new OpenAIDiscoverResolutionEngine({
        model: sorter.modelName,
        reasoningEffort,
        callModel: sorter.callModel,
      }),
      providerId: "openai-discover-resolution-engine",
      modelId: sorter.modelName,
    };
  }

  if (normalized === "openai") {
    const model = deps.modelName?.trim() || "gpt-5.6-sol";
    return {
      engine: {
        resolveDiscovery: async () => {
          throw new Error("DISCOVER_ENGINE_UNAVAILABLE");
        },
      },
      providerId: "openai-discover-resolution-engine",
      modelId: model,
    };
  }
  return {
    engine: {
      resolveDiscovery: async () => {
        throw new Error("DISCOVER_ENGINE_UNAVAILABLE");
      },
    },
    providerId: "unconfigured",
  };
}
