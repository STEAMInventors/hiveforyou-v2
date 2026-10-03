import { describe, expect, it } from "vitest";

import { VALIDATED_STORY_SCHEMA } from "@hiveforyou/shared/projections";

import { iepDomainPack } from "../../../../../domain-packs/iep/pack";
import { calebNguyenStudyFixture } from "../narrative/fixtures/caleb-nguyen-study";
import { generateStory } from "./generateStory";

describe("generateStory", () => {
  it("returns fixture prose without calling OpenAI", async () => {
    const fixture = {
      kind: "prose" as const,
      story: {
        schemaVersion: VALIDATED_STORY_SCHEMA,
        paragraphs: [
          {
            chapter: "then" as const,
            sentences: [{ text: "In 2023, Caleb qualified for special education.", factIds: ["f-prior-year"] }],
          },
        ],
      },
    };
    const result = await generateStory({
      pack: iepDomainPack,
      study: calebNguyenStudyFixture(),
      intent: "meeting",
      fixtureProse: fixture,
    });
    expect(result).toEqual(fixture);
  });
});
