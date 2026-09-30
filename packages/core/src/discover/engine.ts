import type {
  CustomerDiscoveryAnswer,
  DiscoverQuestion,
  HiveDiscoverProposalV1,
  HiveDiscoverProposalV2,
  HiveDiscoverResolutionProposalV1,
} from "@hiveforyou/shared/discover";

import type { ComposedDiscoverPromptInputs } from "./compose-discover-prompt-inputs";
import { FixtureDiscoverEngine } from "./fixture-engine";
import { FixtureDiscoverResolutionEngine } from "./fixture-resolution-engine";
import { FixtureDiscoverV2Engine } from "./fixture-v2-engine";
import { OpenAIDiscoverEngine } from "./openai-engine";
import { OpenAIDiscoverResolutionEngine } from "./openai-resolution-engine";
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
  apiKey: string;
  model: string;
  reasoningEffort: string;
}) => DiscoverEngine;

export type DiscoverEngineFactoryDeps = {
  createOpenAIEngine?: OpenAIEngineFactory;
  adaptiveV2?: boolean;
};

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
  if (normalized === "openai") {
    const apiKey = env.openaiApiKey?.trim();
    const model = env.model?.trim() || "gpt-5.6-sol";
    const reasoningEffort = env.reasoningEffort?.trim() || "medium";
    if (!apiKey) {
      return {
        engine: new UnconfiguredDiscoverEngine(),
        mode: "openai",
        providerId: "openai-discover-engine",
        modelId: model,
        reasoningEffort,
      };
    }
    const factory = deps.createOpenAIEngine ?? ((input) => new OpenAIDiscoverEngine(input));
    return {
      engine: factory({ apiKey, model, reasoningEffort }),
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
  if (normalized === "openai") {
    const apiKey = env.openaiApiKey?.trim();
    const model = env.model?.trim() || "gpt-5.6-sol";
    const reasoningEffort = env.reasoningEffort?.trim() || "medium";
    if (!apiKey) {
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
      engine: new OpenAIDiscoverResolutionEngine({ apiKey, model, reasoningEffort }),
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
