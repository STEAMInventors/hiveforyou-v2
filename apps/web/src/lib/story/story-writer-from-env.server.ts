import "server-only";

import { runStoryWriterPass } from "@hiveforyou/core";
import { getDomainPackByDomainId } from "@hiveforyou/domain-packs";
import type { CanonicalCaseSnapshot } from "@hiveforyou/shared/case-intelligence/3";
import type { CaseViewV2 } from "@hiveforyou/shared/projections";

import type { ServerEnv } from "@/lib/env/server-env";
import { shouldPreferPackForCaseView } from "@/lib/story/prefer-pack-narrative";

export function parseStoryWriterEngine(raw: string | undefined): "openai" | "fixture" | "off" {
  const mode = raw?.trim().toLowerCase();
  if (mode === "openai" || mode === "fixture" || mode === "off") {
    return mode;
  }
  return "off";
}

/** Runs the optional story writer when enabled and case-view has no validated prose yet. */
export async function enrichCaseViewWithValidatedStory(input: {
  caseView: CaseViewV2;
  intelligence: CanonicalCaseSnapshot;
  env: ServerEnv;
  intent?: string | null;
}): Promise<CaseViewV2> {
  const mode = parseStoryWriterEngine(input.env.HIVE_STORY_WRITER_ENGINE);
  if (mode === "off") {
    return input.caseView;
  }
  if (input.caseView.validatedStory?.kind === "fallback") {
    return { ...input.caseView, validatedStory: null };
  }
  if (input.caseView.validatedStory?.kind === "prose") {
    if (shouldPreferPackForCaseView(input.caseView)) {
      return { ...input.caseView, validatedStory: null };
    }
    return input.caseView;
  }

  const pack = getDomainPackByDomainId(input.intelligence.domainId);
  const intent =
    input.intent?.trim() ||
    input.caseView.header.askedText?.trim() ||
    input.caseView.header.headline?.trim() ||
    "";

  try {
    const merged = await runStoryWriterPass({
      caseView: input.caseView,
      intelligence: input.intelligence,
      pack,
      intent,
      mode,
      apiKey: mode === "openai" ? input.env.OPENAI_API_KEY : undefined,
      model: input.env.HIVE_STORY_WRITER_MODEL,
    });
    console.info("[story-writer] enrich_case_view", {
      domainId: input.intelligence.domainId,
      mode,
      resultKind: merged.validatedStory?.kind ?? "none",
    });
    return merged;
  } catch (error) {
    console.error("[story-writer] enrich_failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return input.caseView;
  }
}
