import { describe, expect, it } from "vitest";

import { requireDiscoverPack } from "@hiveforyou/domain-packs";

const IEP_AUDIENCE_ROLES = requireDiscoverPack("iep").audienceRoles ?? [];

import { loadDiscoverPrompt } from "../prompts/load-discover-prompt";
import { composeDiscoverPromptInputs } from "./compose-discover-prompt-inputs";

describe("composeDiscoverPromptInputs pack vocabulary", () => {
  it("does not send missingExpectations or audienceRoles keys to the discover model", () => {
    const prompt = loadDiscoverPrompt("discover-v2");
    const composed = composeDiscoverPromptInputs(prompt, []);
    expect(composed.domainPackVocabulary).not.toContain("missingExpectations");
    expect(composed.domainPackVocabulary).not.toContain("audienceRoles");
    expect(composed.system).not.toContain("missingExpectations");
    expect(composed.system).not.toContain("audienceRoles");
    expect(composed.system).not.toContain(IEP_AUDIENCE_ROLES[0]!.label);
  });

  it("includes audienceVocabulary for packs that define audience roles", () => {
    const prompt = loadDiscoverPrompt("discover-v2");
    const composed = composeDiscoverPromptInputs(prompt, []);
    expect(composed.domainPackVocabulary).toContain("audienceVocabulary");
    expect(composed.domainPackVocabulary).toContain(IEP_AUDIENCE_ROLES[0]!.roleId);
  });
});
