import { describe, expect, it } from "vitest";

import { iepDomainPack } from "../../../../../domain-packs/iep/pack";
import { calebNguyenStudyFixture } from "../../study/narrative/fixtures/caleb-nguyen-study";

import {
  buildProViewModel,
  HeaderSlotValidationError,
} from "./buildProViewModel";
import { InvalidDisplayLabelError, UnlabelledAttributeError } from "./resolveProLabel";

describe("buildProViewModel (Caleb Nguyen)", () => {
  const study = calebNguyenStudyFixture();

  it("builds header, three signals, and guide-ordered groups deterministically", () => {
    const first = buildProViewModel(iepDomainPack, study, { documentCount: 9, caseTypeLabel: "IEP meeting" });
    const second = buildProViewModel(iepDomainPack, study, { documentCount: 9, caseTypeLabel: "IEP meeting" });
    expect(first).toEqual(second);

    expect(first.header.facts.some((f) => f.text === "SLD – Reading")).toBe(true);
    expect(first.header.facts.every((f) => f.text !== "yes")).toBe(true);
    expect(JSON.stringify(first.header).includes("entity_")).toBe(false);

    expect(first.signals.length).toBe(3);
    const titles = first.signals.map((s) => s.title);
    expect(titles.some((t) => /primary need/i.test(t))).toBe(true);
    expect(titles.some((t) => /fluency/i.test(t))).toBe(true);
    expect(titles.some((t) => /gap|record/i.test(t))).toBe(true);
    expect(titles.every((t) => !t.includes("|") && !/eligibility team/i.test(t))).toBe(true);

    const needRow = first.groups.flatMap((g) => g.rows).find((r) => r.label === "Primary need");
    expect(needRow?.state).toBe("changed");
    const priorVal = needRow?.prior && "values" in needRow.prior ? needRow.prior.values[0]?.text : "";
    const currentVal = needRow?.current && "values" in needRow.current ? needRow.current.values[0]?.text : "";
    expect(priorVal).toBe("reading fluency");
    expect(currentVal).toBe("reading comprehension");

    const catRow = first.groups.flatMap((g) => g.rows).find((r) => r.label === "Eligibility category");
    expect(catRow?.state).toBe("reconfirmed");

    const fluencyRow = first.groups.flatMap((g) => g.rows).find((r) => r.id === "cmp-goal-fluency");
    expect(fluencyRow?.state).toBe("dropped");
    const compRow = first.groups.flatMap((g) => g.rows).find((r) => r.id === "cmp-goal-comprehension");
    expect(compRow?.state).toBe("added");

    for (const group of first.groups) {
      for (const row of group.rows) {
        for (const side of [row.prior, row.current]) {
          if ("values" in side) {
            for (const v of side.values) {
              expect(v.chip.label).toMatch(/^[A-Z][A-Za-z\- ]+ · p\.\d+$/);
            }
          }
        }
      }
    }

    expect(first.groups.map((g) => g.title)).not.toContain("Case");
    expect(first.groups.length).toBeGreaterThan(1);
  });
});

describe("buildProViewModel label guards", () => {
  it("throws on pipe labels in dev", () => {
    const badPack = {
      ...iepDomainPack,
      story: {
        ...iepDomainPack.story,
        plainLabels: { ...iepDomainPack.story.plainLabels, "eligibility.primaryNeed": "a|b" },
      },
    };
    expect(() => buildProViewModel(badPack, calebNguyenStudyFixture())).toThrow(InvalidDisplayLabelError);
  });

  it("throws UnlabelledAttributeError when label missing in dev", () => {
    const study = calebNguyenStudyFixture();
    study.slotComparisons.push({
      id: "cmp-unknown",
      attributeId: "totally.unknown.slot",
      sectionId: "goals",
      priorSlot: null,
      currentSlot: null,
      state: "not-compared",
    });
    expect(() => buildProViewModel(iepDomainPack, study)).toThrow(UnlabelledAttributeError);
  });

  it("maps unresolved entity ids to not-captured cells", () => {
    const study = calebNguyenStudyFixture();
    study.facts["current.school.name"] = {
      id: "f-school",
      raw: "entity_school",
      display: "entity_school",
    };
    const model = buildProViewModel(iepDomainPack, study);
    expect(JSON.stringify(model.header).includes("entity_")).toBe(false);
  });

  it("throws when a boolean slot is listed in headerSlots", () => {
    const badGuide = {
      ...iepDomainPack.rulebook!.guides[0]!,
      headerSlots: ["progress.goalMet"],
    };
    const pack = {
      ...iepDomainPack,
      rulebook: iepDomainPack.rulebook
        ? { ...iepDomainPack.rulebook, guides: [badGuide, ...iepDomainPack.rulebook.guides.slice(1)] }
        : iepDomainPack.rulebook,
    };
    const study = calebNguyenStudyFixture();
    study.facts["progress.goalMet"] = { id: "b", raw: "true", display: "yes" };
    expect(() => buildProViewModel(pack, study)).toThrow(HeaderSlotValidationError);
  });
});
