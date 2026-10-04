import type { DomainPack } from "@hiveforyou/domain-pack";
import type { CanonicalCaseSnapshot } from "@hiveforyou/shared/case-intelligence/3";
import type { CaseViewV2 } from "@hiveforyou/shared/projections";
import type { ValidatedStoryResult } from "@hiveforyou/shared/projections";
import type { Study } from "@hiveforyou/shared/pack-study";
import { domainPackViewConfigForDomainId } from "@hiveforyou/shared/projections";

import { buildAnatomyPlan, buildDocumentIndex } from "../../projections/project-case-view-v2-plan";
import { buildPackStudyFromCaseProjection } from "../narrative/build-pack-study-from-projection";
import { generateStory } from "./generateStory";

export type StoryWriterPassInput = {
  caseView: CaseViewV2;
  intelligence: CanonicalCaseSnapshot;
  pack: DomainPack | null;
  study?: Study | null;
  intent: string;
  apiKey?: string;
  model?: string;
  mode: "openai" | "fixture" | "off";
  fixtureProse?: ValidatedStoryResult;
};

export async function runStoryWriterPass(input: StoryWriterPassInput): Promise<CaseViewV2> {
  if (input.mode === "off" || !input.pack) {
    return input.caseView;
  }

  const packView = domainPackViewConfigForDomainId(input.intelligence.domainId);
  const docIndex = buildDocumentIndex(input.caseView.documents);
  const anatomy = buildAnatomyPlan({
    v1: input.caseView,
    intelligence: input.intelligence,
    pack: packView,
    docIndex,
  });

  const study =
    input.study ??
    buildPackStudyFromCaseProjection({
      v1: input.caseView,
      intelligence: input.intelligence,
      anatomy,
      pack: packView,
    });

  if (!study) {
    return input.caseView;
  }

  const result = await generateStory({
    pack: input.pack,
    study,
    intent: input.intent,
    apiKey: input.mode === "openai" ? input.apiKey : undefined,
    model: input.model,
    fixtureProse: input.mode === "fixture" ? input.fixtureProse : undefined,
  });

  return {
    ...input.caseView,
    validatedStory: result,
  };
}
