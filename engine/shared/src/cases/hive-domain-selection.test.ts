import { describe, expect, it } from "vitest";

import { hiveDomainConflictsWithComposer } from "./hive-domain-selection";

describe("hiveDomainConflictsWithComposer", () => {
  it("returns false when either domain is missing", () => {
    expect(
      hiveDomainConflictsWithComposer({
        establishedDomainId: null,
        composerExplicitDomainId: "iep",
      }),
    ).toBe(false);
    expect(
      hiveDomainConflictsWithComposer({
        establishedDomainId: "iep",
        composerExplicitDomainId: null,
      }),
    ).toBe(false);
  });

  it("returns false when domains match", () => {
    expect(
      hiveDomainConflictsWithComposer({
        establishedDomainId: "iep",
        composerExplicitDomainId: "iep",
      }),
    ).toBe(false);
  });

  it("returns true when both domains are set and differ", () => {
    expect(
      hiveDomainConflictsWithComposer({
        establishedDomainId: "medicaid",
        composerExplicitDomainId: "iep",
      }),
    ).toBe(true);
  });

  it("ignores surrounding whitespace", () => {
    expect(
      hiveDomainConflictsWithComposer({
        establishedDomainId: " iep ",
        composerExplicitDomainId: "iep",
      }),
    ).toBe(false);
  });
});