import { getDomainPackByDomainId } from "@hiveforyou/domain-packs";
import type { CanonicalCaseSnapshot } from "@hiveforyou/shared/case-intelligence/3";
import type { CaseViewV2 } from "@hiveforyou/shared/projections";

import type { CallModel } from "./call-model";
import { shouldPreferPackForCaseView } from "./prefer-pack-narrative";
import { runStoryWriterPass } from "./storyWriterPass";

export function parseStoryWriterEngine(raw: string | undefined): "openai" | "fixture" | "off" {
  const mode = raw?.trim().toLowerCase();
  if (mode === "openai" || mode === "fixture" || mode === "off") {
    return mode;
  }
  return "off";
}

export type EnrichCaseViewWithValidatedStoryInput = {
  caseView: CaseViewV2;
  intelligence: CanonicalCaseSnapshot;
  mode: "openai" | "fixture" | "off";
  model?: string;
  callModel?: CallModel;
  intent?: string | null;
  onEnriched?: (info: {
    domainId: string;
    mode: "openai" | "fixture" | "off";
    resultKind: string;
  }) => void;
  onFailed?: (info: { message: string }) => void;
};

/** Runs the optional story writer when enabled and case-view has no validated prose yet. */
export async function enrichCaseViewWithValidatedStory(
  input: EnrichCaseViewWithValidatedStoryInput,
): Promise<CaseViewV2> {
  if (input.mode === "off") {
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
      mode: input.mode,
      model: input.model,
      callModel: input.callModel,
    });
    input.onEnriched?.({
      domainId: input.intelligence.domainId,
      mode: input.mode,
      resultKind: merged.validatedStory?.kind ?? "none",
    });
    return merged;
  } catch (error) {
    input.onFailed?.({
      message: error instanceof Error ? error.message : "unknown",
    });
    return input.caseView;
  }
}
