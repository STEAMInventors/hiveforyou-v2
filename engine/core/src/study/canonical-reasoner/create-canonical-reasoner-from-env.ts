import {
  compileDeclarativeCanonicalReasonerContext,
  hashCompiledCanonicalReasonerContext,
  loadDeclarativePackFromRoot,
} from "@hiveforyou/domain-packs/declarative";
import type { CanonicalStudyReasoner } from "@hiveforyou/shared/canonical-study-graph";
import { createCallModelFromOpenAIClient } from "@hiveforyou/shared/llm/call-model-from-openai-client";
import { getLLMRouter, resolveTierModelId } from "@hiveforyou/shared/llm/router";
import type { CallModel } from "@hiveforyou/shared/model/call-model";

import { FixtureCanonicalReasoner } from "./fixture-canonical-reasoner.js";
import { ProductionCanonicalReasoner } from "./production-canonical-reasoner.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const reasonerModuleDir = dirname(fileURLToPath(import.meta.url));
const defaultFixturePath = join(reasonerModuleDir, "fixtures/minimal-graph-body.json");
import { CanonicalReasonerUnavailableError } from "./reasoner-errors.js";

export type CanonicalGraphReasonerEngineMode = "anthropic" | "openai" | "fixture" | "unconfigured";

export type CreateCanonicalReasonerFromEnvResult = {
  mode: CanonicalGraphReasonerEngineMode;
  reasoner: CanonicalStudyReasoner;
  providerId: string;
  modelId: string;
  packContextSha256: string;
};

export type CreateCanonicalReasonerFromEnvOptions = {
  env?: Record<string, string | undefined>;
  callModel?: CallModel;
  declarativePackRoot?: string;
  fixturePath?: string;
};

function readEngineMode(source: Record<string, string | undefined>): CanonicalGraphReasonerEngineMode {
  const raw = source.HIVE_CANONICAL_GRAPH_REASONER_ENGINE?.trim().toLowerCase();
  if (!raw || raw === "off" || raw === "unconfigured") {
    return "unconfigured";
  }
  if (raw === "anthropic" || raw === "openai" || raw === "fixture") {
    return raw;
  }
  throw new CanonicalReasonerUnavailableError(`UNKNOWN_REASONER_ENGINE:${raw}`);
}

function resolvePackRoot(source: Record<string, string | undefined>, override?: string): string {
  const fromEnv = source.HIVE_DECLARATIVE_PACK_ROOT?.trim();
  if (override?.trim()) {
    return override.trim();
  }
  if (fromEnv) {
    return fromEnv;
  }
  throw new CanonicalReasonerUnavailableError("DECLARATIVE_PACK_ROOT_UNCONFIGURED");
}

export function createCanonicalReasonerFromEnv(
  options: CreateCanonicalReasonerFromEnvOptions = {},
): CreateCanonicalReasonerFromEnvResult {
  const source = options.env ?? process.env;
  const mode = readEngineMode(source);

  const packRoot = resolvePackRoot(source, options.declarativePackRoot);
  const raw = loadDeclarativePackFromRoot(packRoot);
  const packContext = compileDeclarativeCanonicalReasonerContext(raw);
  const packContextSha256 = hashCompiledCanonicalReasonerContext(packContext);

  if (mode === "fixture") {
    const fixturePath =
      options.fixturePath?.trim() ||
      source.HIVE_CANONICAL_GRAPH_REASONER_FIXTURE?.trim() ||
      defaultFixturePath;
    return {
      mode,
      providerId: "fixture-canonical-reasoner",
      modelId: "fixture",
      packContextSha256,
      reasoner: new FixtureCanonicalReasoner({ fixturePath }),
    };
  }

  if (mode === "unconfigured") {
    throw new CanonicalReasonerUnavailableError("REASONER_ENGINE_UNCONFIGURED");
  }

  const requiredProvider = mode;
  const configuredProvider = source.MODEL_PROVIDER?.trim().toLowerCase() || "openai";
  if (configuredProvider !== requiredProvider) {
    throw new CanonicalReasonerUnavailableError(
      `REASONER_PROVIDER_MISMATCH:engine=${requiredProvider},env=${configuredProvider}`,
    );
  }

  let callModel: CallModel;
  let modelId =
    source.HIVE_CANONICAL_GRAPH_REASONER_MODEL?.trim() ||
    (requiredProvider === "openai"
      ? source.MODEL_HEAVY_LIFTER?.trim() || resolveTierModelId("heavy_lifter")
      : source.MODEL_NAME?.trim() || "claude-opus-5-5");

  if (options.callModel) {
    callModel = options.callModel;
  } else if (requiredProvider === "openai") {
    const { client } = getLLMRouter("heavy_lifter");
    callModel = createCallModelFromOpenAIClient(client);
  } else {
    throw new CanonicalReasonerUnavailableError("CALL_MODEL_REQUIRED");
  }

  const reasoningEffort =
    source.HIVE_CANONICAL_GRAPH_REASONER_REASONING_EFFORT?.trim() ||
    source.HIVE_CANONICAL_STUDY_REASONING_EFFORT?.trim() ||
    "medium";

  const maxOutputTokensRaw = source.HIVE_CANONICAL_GRAPH_REASONER_MAX_OUTPUT_TOKENS?.trim();
  const maxOutputTokens = maxOutputTokensRaw
    ? Number.parseInt(maxOutputTokensRaw, 10)
    : undefined;

  const providerId =
    requiredProvider === "anthropic"
      ? "anthropic-canonical-graph-reasoner-v1"
      : "openai-canonical-graph-reasoner-v1";

  return {
    mode,
    providerId,
    modelId,
    packContextSha256,
    reasoner: new ProductionCanonicalReasoner({
      providerId,
      modelId,
      callModel,
      reasoningEffort,
      maxOutputTokens: Number.isFinite(maxOutputTokens) ? maxOutputTokens : undefined,
      packContext,
    }),
  };
}
