import { describe, expect, it } from "vitest";

import { IEP_NARRATIVE_BLOCK } from "../../../../../domain-packs/iep/narrative";
import { composeNarrative } from "./composeNarrative";
import {
  calebNguyenStudyFixture,
  calebNguyenStudyWithoutPriorFixture,
} from "./fixtures/caleb-nguyen-study";

const iepPackForNarrative = { narrative: IEP_NARRATIVE_BLOCK };

describe("composeNarrative (Caleb Nguyen 9-document fixture)", () => {
  it("matches expected chapters and copy", () => {
    const output = composeNarrative(iepPackForNarrative, calebNguyenStudyFixture());
    expect(output.paragraphs.map((p) => p.chapter)).toEqual(["then", "since", "now", "next", "ask"]);

    const thenEligibility = output.paragraphs
      .find((p) => p.chapter === "then")
      ?.sentences.find((s) => s.templateId === "then.eligibility");
    expect(thenEligibility?.text).toContain("2023");
    expect(thenEligibility?.text).toContain("a learning disability in reading");
    expect(thenEligibility?.text).toContain("reading fluency");

    const thenGoal = output.paragraphs
      .find((p) => p.chapter === "then")
      ?.sentences.find((s) => s.templateId === "then.goal");
    expect(thenGoal?.text).toContain("62");
    expect(thenGoal?.text).toContain("95");

    const sinceProgress = output.paragraphs
      .find((p) => p.chapter === "since")
      ?.sentences.find((s) => s.templateId === "since.progress");
    expect(sinceProgress?.text).toContain("91");
    expect(sinceProgress?.text).toContain("not met");

    const sinceGap = output.paragraphs
      .find((p) => p.chapter === "since")
      ?.sentences.find((s) => s.templateId === "since.gap");
    expect(sinceGap).toBeDefined();
    expect(sinceGap?.text).toContain("Oct 2024");
    expect(sinceGap?.text).toContain("Sep 2026");

    const nextNeed = output.paragraphs
      .find((p) => p.chapter === "next")
      ?.sentences.find((s) => s.templateId === "next.need");
    expect(nextNeed?.text).toContain("reading comprehension");

    for (const paragraph of output.paragraphs) {
      for (const sentence of paragraph.sentences) {
        expect(sentence.text).not.toMatch(/_/);
        expect(sentence.text).not.toContain("standard_score");
        expect(sentence.text).not.toContain("times_standard_time");
        expect(sentence.text).not.toMatch(/GOAL_/);
        expect(sentence.factIds.length).toBeGreaterThanOrEqual(1);
      }
    }

    const runAgain = composeNarrative(iepPackForNarrative, calebNguyenStudyFixture());
    expect(runAgain).toEqual(output);
  });

  it("skips then.* when no prior anchor", () => {
    const output = composeNarrative(iepPackForNarrative, calebNguyenStudyWithoutPriorFixture());
    const thenSentences = output.paragraphs.find((p) => p.chapter === "then")?.sentences ?? [];
    expect(thenSentences.every((s) => !s.templateId.startsWith("then."))).toBe(true);
  });
});
