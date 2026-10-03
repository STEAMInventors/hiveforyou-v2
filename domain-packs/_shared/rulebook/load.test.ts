import { afterEach, describe, expect, it } from "vitest";

import { iepDomainPack } from "@hiveforyou/domain-pack-iep";
import { medicaidDomainPack } from "@hiveforyou/domain-pack-medicaid";

import { __testResetRulebookLoadState, getGuide } from "./load.ts";

describe("getGuide", () => {
  afterEach(() => {
    __testResetRulebookLoadState();
    delete process.env.ALLOW_DRAFT_RULEBOOKS;
    delete process.env.NODE_ENV;
  });

  it("returns IEP guide for IEP docType", () => {
    const guide = getGuide(iepDomainPack, "IEP");
    expect(guide?.docType).toBe("Individualized Education Program");
    expect(guide?.reviewStatus).toBe("reviewed");
  });

  it("hides draft guide by default", () => {
    const guide = getGuide(medicaidDomainPack, "Notice of Action");
    expect(guide).toBeNull();
  });

  it("shows draft guide when ALLOW_DRAFT_RULEBOOKS=true", () => {
    process.env.ALLOW_DRAFT_RULEBOOKS = "true";
    const guide = getGuide(medicaidDomainPack, "Notice of Action");
    expect(guide?.reviewStatus).toBe("draft");
  });
});
