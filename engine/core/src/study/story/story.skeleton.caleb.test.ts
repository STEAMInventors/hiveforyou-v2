import { describe, expect, it } from "vitest";

import { iepDomainPack } from "../../../../domain-packs/iep/pack";
import { calebNguyenStudyFixture } from "../narrative/fixtures/caleb-nguyen-study";
import { buildSkeleton } from "./buildSkeleton";

describe("buildSkeleton (Caleb Nguyen)", () => {
  it("orders chapters and includes progress value 91", () => {
    const skeleton = buildSkeleton(iepDomainPack, calebNguyenStudyFixture(), "prepare for IEP meeting");
    expect(skeleton.chapters.map((c) => c.chapter)).toEqual(["then", "since", "now", "next", "ask"]);
    expect(skeleton.subject).toBe("Caleb");

    const since = skeleton.chapters.find((c) => c.chapter === "since");
    expect(since && "series" in since && since.series[0]?.points[0]?.value).toBe("91");

    expect(Object.values(skeleton.facts).some((f) => f.value === "91")).toBe(true);

    const ask = skeleton.chapters.find((c) => c.chapter === "ask");
    expect(ask && "basis" in ask && ask.basis).toContain("reading comprehension");
  });

  it("puts goal target and anchor year in then chapter for writer validation", () => {
    const study = calebNguyenStudyFixture();
    delete study.facts["prior.year"];
    const skeleton = buildSkeleton(iepDomainPack, study, "meeting");
    const then = skeleton.chapters.find((c) => c.chapter === "then");
    expect(then && "factIds" in then).toBe(true);
    const thenIds = then && "factIds" in then ? then.factIds : [];
    expect(thenIds).toContain("f-prior-target");
    expect(thenIds).toContain("prior-year:anchor");
    expect(skeleton.facts["prior-year:anchor"]?.value).toBe("2023");
  });

  it("fills goal target digits from measure series when claim display is empty", () => {
    const study = calebNguyenStudyFixture();
    delete study.facts["prior.year"];
    study.facts["prior.goal.target"]!.display = "";
    study.anchors.prior = { label: "2023 IEP", date: "" };
    const skeleton = buildSkeleton(iepDomainPack, study, "meeting");
    expect(skeleton.facts["f-prior-target"]?.value).toBe("95");
    expect(skeleton.facts["prior-year:anchor"]?.value).toBe("2023");
  });
});
