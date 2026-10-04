import { describe, expect, it } from "vitest";

import "@hiveforyou/domain-packs";
import {
  l001CaseViewV2ProjectionLogicalDocuments,
  l001CaseViewV2ProjectionSnapshot,
} from "../../projections/fixtures/l001-case-view-v2-projection";
import { projectCaseViewV2Minimal } from "../../projections/project-case-view-v2-minimal";
import { enrichCaseViewWithValidatedStory } from "./enrich-case-view-with-validated-story";

describe("enrichCaseViewWithValidatedStory", () => {
  it("merges validated prose from an injected callModel", async () => {
    const intelligence = {
      ...l001CaseViewV2ProjectionSnapshot(),
      domainId: "iep",
    };
    const caseView = projectCaseViewV2Minimal({
      intelligence,
      logicalDocuments: l001CaseViewV2ProjectionLogicalDocuments(),
    });
    expect(caseView.validatedStory).toBeFalsy();

    const enriched = await enrichCaseViewWithValidatedStory({
      caseView,
      intelligence,
      mode: "openai",
      model: "gpt-4o-mini",
      intent: "meeting prep",
      callModel: async (req) => {
        const payload = JSON.parse(req.userContent) as {
          facts: Record<string, { value: string }>;
          chapterFactIds: Array<{ chapter: string; factIds: string[] }>;
        };
        const paragraphs = payload.chapterFactIds.map(({ chapter, factIds }) => {
          const fid = factIds[0];
          const value = fid ? (payload.facts[fid]?.value ?? "Supported fact.") : "Supported fact.";
          if (chapter === "ask") {
            return {
              chapter,
              sentences: [
                {
                  text: "What reading goal should the team track in the next IEP?",
                  factIds: factIds.slice(0, 1),
                },
              ],
            };
          }
          return {
            chapter,
            sentences: [{ text: value, factIds: fid ? [fid] : [] }],
          };
        });
        return { outputText: JSON.stringify({ paragraphs }) };
      },
    });

    expect(enriched.validatedStory?.kind).toBe("prose");
  });
});
