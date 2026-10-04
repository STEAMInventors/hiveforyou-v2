import { describe, expect, it } from "vitest";

import { iepDomainPack } from "../../../../domain-packs/iep/pack";
import { calebNguyenStudyFixture } from "../narrative/fixtures/caleb-nguyen-study";
import { buildSkeleton } from "./buildSkeleton";
import { validateStory } from "./validateStory";

describe("validateStory", () => {
  it("accepts prose that matches skeleton fact ids and numbers", () => {
    const skeleton = buildSkeleton(iepDomainPack, calebNguyenStudyFixture(), "meeting prep");
    const output = {
      paragraphs: skeleton.chapters.map((chapter) => {
        if (chapter.chapter === "ask" && "basis" in chapter) {
          return {
            chapter: "ask",
            sentences: [
              {
                text: "What goal will track reading comprehension in the new IEP?",
                factIds: [...chapter.factIds],
              },
            ],
          };
        }
        if (chapter.chapter === "then" || chapter.chapter === "now") {
          return {
            chapter: chapter.chapter,
            sentences: [
              {
                text: `Summary for ${chapter.chapter} with cited facts.`,
                factIds: [...chapter.factIds.slice(0, 1)],
              },
            ],
          };
        }
        if (chapter.chapter === "since" && "series" in chapter) {
          const fid = chapter.series[0]?.points[0]?.factId ?? chapter.gaps[0]?.factId;
          return {
            chapter: "since",
            sentences: [{ text: "Progress was 91 words correct per minute.", factIds: fid ? [fid] : [] }],
          };
        }
        if (chapter.chapter === "next" && "diffs" in chapter) {
          return {
            chapter: "next",
            sentences: [
              {
                text: "The main area of need shifted toward reading comprehension.",
                factIds: [...chapter.diffs[0]!.factIds],
              },
            ],
          };
        }
        return { chapter: chapter.chapter, sentences: [{ text: "Placeholder.", factIds: [] }] };
      }),
    };
    const result = validateStory(skeleton, output);
    expect(result.ok).toBe(true);
  });

  it("rejects sentences with unknown fact ids", () => {
    const skeleton = buildSkeleton(iepDomainPack, calebNguyenStudyFixture(), "meeting prep");
    const result = validateStory(skeleton, {
      paragraphs: [
        {
          chapter: skeleton.chapters[0]!.chapter,
          sentences: [{ text: "No backing.", factIds: ["not-a-real-id"] }],
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("Unknown factId"))).toBe(true);
    }
  });
});
