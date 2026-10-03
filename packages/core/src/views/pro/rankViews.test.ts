import { describe, expect, it } from "vitest";

import { DEFAULT_PRO_VIEW_WEIGHTS } from "@hiveforyou/domain-pack";
import { iepDomainPack } from "../../../../../domain-packs/iep/pack";
import { calebNguyenStudyFixture } from "../../study/narrative/fixtures/caleb-nguyen-study";

import { rankViews } from "./rankViews";

describe("rankViews (Caleb Nguyen)", () => {
  it("orders brief, side, trends, ledger with exact why strings", () => {
    const study = calebNguyenStudyFixture();
    const ranked = rankViews(study, iepDomainPack.pro.viewWeights);
    expect(ranked.map((v) => v.id)).toEqual(["brief", "side", "trends", "ledger"]);
    expect(ranked[0]!.why).toBe("3 ranked signals and 3 changes to raise");
    expect(ranked[1]!.why).toMatch(/compared across/);
    expect(ranked[2]!.why).toMatch(/measure.*over time/);
    expect(ranked[3]!.why).toMatch(/fact.*each with its quote/);
  });

  it("puts brief last when there are no signals", () => {
    const study = calebNguyenStudyFixture();
    study.rankedSignals = [];
    const ranked = rankViews(study, DEFAULT_PRO_VIEW_WEIGHTS);
    expect(ranked.at(-1)!.id).toBe("brief");
    expect(ranked.at(-1)!.score).toBe(0);
  });
});
