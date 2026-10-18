import { describe, expect, it } from "vitest";

import { resolveStudyDeclarativePackBinding } from "./resolve-study-declarative-pack.js";

describe("resolveStudyDeclarativePackBinding", () => {
  it("pins digest across retry when resolver enabled", () => {
    const env = {
      HIVE_DECLARATIVE_STUDY_PACK_RESOLVER: "1",
      HIVE_DECLARATIVE_PACK_ALLOW_PRERELEASE: "1",
    };
    const first = resolveStudyDeclarativePackBinding({ domainId: "iep", env });
    const second = resolveStudyDeclarativePackBinding({
      domainId: "iep",
      env,
      existingBinding: first.binding,
    });
    expect(second.binding.contentDigest).toBe(first.binding.contentDigest);
    expect(second.selection.compiledProposalPack.manifest.id).toBe("iep");
  });

  it("fails closed when resolver disabled", () => {
    expect(() =>
      resolveStudyDeclarativePackBinding({
        domainId: "iep",
        env: { HIVE_DECLARATIVE_STUDY_PACK_RESOLVER: "0" },
      }),
    ).toThrow(/not enabled/);
  });
});
