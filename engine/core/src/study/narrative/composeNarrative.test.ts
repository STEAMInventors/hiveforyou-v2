import { describe, expect, it } from "vitest";

import type { Study } from "@hiveforyou/shared/pack-study";

import { composeNarrative } from "./composeNarrative";

const emptyStudy = (): Study => ({
  anchors: { prior: null, current: null },
  facts: {},
  seriesAfterPrior: null,
  recordGap: null,
  measureSeries: [],
  recordGaps: [],
  anchorComparisons: [],
  reevalMeasures: [],
  goals: { prior: [], current: [] },
  topSignal: null,
  slotComparisons: [],
  rankedSignals: [],
});

describe("composeNarrative rules", () => {
  it("skips a template when a slot is missing", () => {
    const pack = {
      narrative: {
        opening: "Hi",
        plain: {},
        chapters: ["then"],
        templates: [
          {
            id: "then.goal",
            chapter: "then",
            when: { kind: "factExists", slot: "prior.goal.target" },
            say: "From {prior.goal.baseline} to {prior.goal.target}.",
            slots: ["prior.goal.baseline", "prior.goal.target"],
          },
        ],
      },
    };
    const study = emptyStudy();
    study.facts["prior.goal.target"] = { id: "t", raw: "95", display: "95" };
    const out = composeNarrative(pack, study);
    expect(out.paragraphs).toEqual([]);
    expect(out.skipped).toEqual([{ templateId: "then.goal", missingSlots: ["prior.goal.baseline"] }]);
  });

  it("omits empty chapters", () => {
    const pack = {
      narrative: {
        opening: "Hi",
        chapters: ["then", "ask"],
        templates: [],
        plain: {},
      },
    };
    expect(composeNarrative(pack, emptyStudy()).paragraphs).toEqual([]);
  });
});
