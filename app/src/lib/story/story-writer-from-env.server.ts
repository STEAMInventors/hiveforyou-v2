import "server-only";

import {
  enrichCaseViewWithValidatedStory as enrichCaseViewCore,
  parseStoryWriterEngine,
} from "@hiveforyou/core";
import type { CanonicalCaseSnapshot } from "@hiveforyou/shared/case-intelligence/3";
import type { CaseViewV2 } from "@hiveforyou/shared/projections";

import type { ServerEnv } from "@/lib/env/server-env";

import { tryCreateCallModelFromEnv } from "@hiveforyou/model-providers/env";

import { callModelEnvFromServerEnv } from "@/lib/model/call-model.server";

import { createStoryWriterCallModel } from "./story-writer-call-model.server";

export { parseStoryWriterEngine };

export async function enrichCaseViewWithValidatedStory(input: {
  caseView: CaseViewV2;
  intelligence: CanonicalCaseSnapshot;
  env: ServerEnv;
  intent?: string | null;
}): Promise<CaseViewV2> {
  const mode = parseStoryWriterEngine(input.env.HIVE_STORY_WRITER_ENGINE);
  const modelBundle = tryCreateCallModelFromEnv(callModelEnvFromServerEnv(input.env));
  return enrichCaseViewCore({
    caseView: input.caseView,
    intelligence: input.intelligence,
    intent: input.intent,
    mode,
    model: modelBundle?.modelName,
    callModel: mode === "openai" ? createStoryWriterCallModel(input.env) : undefined,
    onEnriched: (info) => console.info("[story-writer] enrich_case_view", info),
    onFailed: (info) => console.error("[story-writer] enrich_failed", info),
  });
}
