import { describe, expect, it } from "vitest";

import { resolveIntakeDomain } from "./domain-resolution";
import { ensureTestIepPackRegistered } from "./test-fixtures/register-test-iep-pack";

ensureTestIepPackRegistered();

describe("resolveIntakeDomain", () => {
  it("uses explicit executable domain without Jev", () => {
    const resolution = resolveIntakeDomain({
      rawIntent: "Help with IEP meeting",
      explicitDomainId: "iep",
    });
    expect(resolution.resolutionSource).toBe("EXPLICIT");
    expect(resolution.resolvedDomainId).toBe("iep");
    expect(resolution.studyPath).toBe("DOMAIN_PACK");
    expect(resolution.jevDomainProposal).toBeNull();
  });

  it("routes NO_MATCH to generic study", () => {
    const resolution = resolveIntakeDomain({
      rawIntent: "Organize my files",
      explicitDomainId: null,
      jevDomainProposal: "NO_MATCH",
      jevDomainConfidence: 0.9,
    });
    expect(resolution.studyPath).toBe("GENERIC_STUDY");
    expect(resolution.resolvedDomainId).toBeNull();
  });
});
