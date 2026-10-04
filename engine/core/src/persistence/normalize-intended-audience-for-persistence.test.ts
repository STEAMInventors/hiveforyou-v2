import { describe, expect, it } from "vitest";

import { normalizeIntendedAudienceForPersistence } from "./normalize-intended-audience-for-persistence";
import { persistCaseCustomerContextIntake, InMemoryCaseCustomerContextRepository } from "./case-customer-context-repository";

describe("normalizeIntendedAudienceForPersistence", () => {
  it("maps model suggestion ids via roleHint to generic pack roles", () => {
    const normalized = normalizeIntendedAudienceForPersistence(
      {
        domainId: "iep",
        objective: "x",
        shareIntent: "yes",
        intendedAudienceRoleId: "aud-advisor",
      },
      { domainResolved: false },
      [{ id: "aud-advisor", label: "An advisor or advocate", roleHint: "advisor" }],
    );
    expect(normalized.intendedAudienceRoleId).toBe("generic.advisor");
  });

  it("maps model suggestion ids via roleHint to resolved domain pack roles", () => {
    const normalized = normalizeIntendedAudienceForPersistence(
      {
        domainId: "iep",
        objective: "x",
        shareIntent: "yes",
        intendedAudienceRoleId: "aud-advocate",
      },
      { domainResolved: true, domainId: "iep" },
      [{ id: "aud-advocate", label: "Advocate", roleHint: "advocate" }],
    );
    expect(normalized.intendedAudienceRoleId).toBe("advocate");
  });

  it("persists after normalizing model audience ids", async () => {
    const repo = new InMemoryCaseCustomerContextRepository();
    await persistCaseCustomerContextIntake(repo, {
      userId: "user-1",
      caseId: "case-1",
      intake: {
        domains: [
          {
            domainId: "iep",
            objective: "Understand services",
            shareIntent: "yes",
            intendedAudienceRoleId: "aud-advisor",
          },
        ],
      },
      suggestionsByDomainId: {
        iep: [{ id: "aud-advisor", label: "An advisor or advocate", roleHint: "advocate" }],
      },
    });
    const audience = await repo.getActiveByCaseAndType("case-1", "INTENDED_AUDIENCE", "iep");
    expect(audience?.valueJson).toMatchObject({ roleId: "advocate" });
  });
});
