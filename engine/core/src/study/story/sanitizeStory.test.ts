import { describe, expect, it } from "vitest";

import { iepDomainPack } from "../../../../domain-packs/iep/pack";
import { calebNguyenStudyFixture } from "../narrative/fixtures/caleb-nguyen-study";
import { buildSkeleton } from "./buildSkeleton";
import { sanitizeStoryModelOutput, validateStory } from "./validateStory";

describe("sanitizeStoryModelOutput", () => {
  it("replaces hallucinated factIds so validation can pass", () => {
    const skeleton = buildSkeleton(iepDomainPack, calebNguyenStudyFixture(), "meeting");
    const gapId = skeleton.chapters.find((c) => c.chapter === "since");
    const gapFactId =
      gapId && "gaps" in gapId && gapId.gaps[0] ? gapId.gaps[0].factId : "f-search-scope-gap";

    const raw = {
      paragraphs: skeleton.chapters.map((chapter) => {
        if (chapter.chapter === "ask" && "basis" in chapter) {
          return {
            chapter: "ask",
            sentences: [
              {
                text: "What goal will track reading comprehension in the new IEP?",
                factIds: ["hallucinated-id"],
              },
            ],
          };
        }
        if (chapter.chapter === "since" && "gaps" in chapter && chapter.gaps.length) {
          return {
            chapter: "since",
            sentences: [
              {
                text: `Records are quiet from ${chapter.gaps[0]!.from} through ${chapter.gaps[0]!.to}.`,
                factIds: [gapFactId],
              },
            ],
          };
        }
        if (chapter.chapter === "then" || chapter.chapter === "now") {
          return {
            chapter: chapter.chapter,
            sentences: [
              {
                text: `Summary for ${chapter.chapter}.`,
                factIds: [...chapter.factIds.slice(0, 1)],
              },
            ],
          };
        }
        return {
          chapter: chapter.chapter,
          sentences: [{ text: "Summary.", factIds: ["bad-id"] }],
        };
      }),
    };

    const sanitized = sanitizeStoryModelOutput(skeleton, raw);
    expect(sanitizeStoryModelOutput(skeleton, raw)).not.toBeNull();
    const result = validateStory(skeleton, sanitized);
    expect(result.ok).toBe(true);
  });

  it("adds factIds for each number when model cites only baseline (62) but text includes target (95)", () => {
    const skeleton = buildSkeleton(iepDomainPack, calebNguyenStudyFixture(), "meeting");
    const then = skeleton.chapters.find((c) => c.chapter === "then");
    expect(then && "factIds" in then).toBe(true);
    const baselineId = "f-prior-baseline";
    const targetId = "f-prior-target";

    const raw = {
      paragraphs: skeleton.chapters.map((chapter) => {
        if (chapter.chapter === "then" && "factIds" in chapter) {
          return {
            chapter: "then",
            sentences: [
              {
                text: "The prior IEP set reading fluency from 62 to 95 words per minute.",
                factIds: [baselineId],
              },
            ],
          };
        }
        if (chapter.chapter === "ask" && "basis" in chapter) {
          return {
            chapter: "ask",
            sentences: [
              {
                text: "What goal will track reading comprehension in the new IEP?",
                factIds: chapter.factIds.slice(0, 1),
              },
            ],
          };
        }
        return {
          chapter: chapter.chapter,
          sentences: [
            {
              text: "Summary line without digits.",
              factIds: [...("factIds" in chapter ? chapter.factIds.slice(0, 1) : [])],
            },
          ],
        };
      }),
    };

    const sanitized = sanitizeStoryModelOutput(skeleton, raw);
    const thenSentence = sanitized?.paragraphs.find((p) => p.chapter === "then")?.sentences[0];
    expect(thenSentence?.factIds).toContain(baselineId);
    expect(thenSentence?.factIds).toContain(targetId);

    const result = validateStory(skeleton, sanitized);
    expect(result.ok).toBe(true);
  });
});
