import { describe, expect, it } from "vitest";

import {
  InMemoryCaseCustomerContextRepository,
  buildCaseCustomerContextSnapshot,
  customerContextForEngine2,
  persistCaseCustomerContextIntake,
} from "./case-customer-context-repository";

describe("case customer context", () => {
  it("supersedes prior active values per context type", async () => {
    const repo = new InMemoryCaseCustomerContextRepository();

    await persistCaseCustomerContextIntake(repo, {
      userId: "user-1",
      caseId: "case-1",
      intake: {
        domains: [{ domainId: "not-a-pack", objective: "First objective", shareIntent: "no" }],
      },
    });

    await persistCaseCustomerContextIntake(repo, {
      userId: "user-1",
      caseId: "case-1",
      intake: {
        domains: [
          {
            domainId: "not-a-pack",
            objective: "Updated objective",
            shareIntent: "yes",
            intendedAudienceRoleId: "generic.advisor",
          },
        ],
      },
    });

    const active = await repo.listActiveByCase("case-1");
    expect(active).toHaveLength(3);
    const snapshot = buildCaseCustomerContextSnapshot(active);
    expect(snapshot?.domains[0]?.objective).toBe("Updated objective");
    expect(snapshot?.domains[0]?.shareIntent).toBe("yes");
    expect(snapshot?.domains[0]?.intendedAudience).toEqual({
      roleId: "generic.advisor",
      label: "Advisor",
      domainPackId: null,
      domainPackVersion: null,
    });

    const allRows = (repo as unknown as { rows: { supersededAt: string | null }[] }).rows;
    expect(allRows.filter((row) => row.supersededAt === null)).toHaveLength(3);
    expect(allRows.filter((row) => row.supersededAt !== null).length).toBeGreaterThanOrEqual(2);
  });

  it("keeps objective and audience independent per domain", async () => {
    const repo = new InMemoryCaseCustomerContextRepository();
    await persistCaseCustomerContextIntake(repo, {
      userId: "user-1",
      caseId: "case-1",
      intake: {
        domains: [
          {
            domainId: "iep",
            objective: "Prepare for an IEP meeting",
            shareIntent: "yes",
            intendedAudienceRoleId: "school_team",
          },
          {
            domainId: "bankruptcy",
            objective: "Organize bankruptcy documents",
            shareIntent: "yes",
            intendedAudienceRoleId: "generic.advisor",
          },
          { domainId: "medicaid", objective: "Review notices", shareIntent: "no" },
        ],
      },
    });

    await persistCaseCustomerContextIntake(repo, {
      userId: "user-1",
      caseId: "case-1",
      intake: {
        domains: [{ domainId: "iep", objective: "Updated IEP goal", shareIntent: "no" }],
      },
    });

    const iep = await repo.getActiveByCaseAndType("case-1", "OBJECTIVE", "iep");
    const bankruptcy = await repo.getActiveByCaseAndType("case-1", "OBJECTIVE", "bankruptcy");
    const medicaid = await repo.getActiveByCaseAndType("case-1", "OBJECTIVE", "medicaid");
    expect((iep?.valueJson as { text: string }).text).toBe("Updated IEP goal");
    expect((bankruptcy?.valueJson as { text: string }).text).toBe("Organize bankruptcy documents");
    expect((medicaid?.valueJson as { text: string }).text).toBe("Review notices");
    expect(iep?.domainId).toBe("iep");
    expect((await repo.listActiveByCase("case-1")).filter((row) => row.supersededAt === null).length).toBeGreaterThan(3);

    const snapshot = buildCaseCustomerContextSnapshot(await repo.listActiveByCase("case-1"));
    const engine2 = customerContextForEngine2(snapshot, "bankruptcy");
    expect(engine2).toMatchObject({
      domainId: "bankruptcy",
      objective: "Organize bankruptcy documents",
      source: "CUSTOMER_ASSERTION",
    });
    expect(engine2).not.toHaveProperty("intendedAudience");
    expect(engine2).not.toHaveProperty("shareIntent");
    expect(snapshot?.domains.find((domain) => domain.domainId === "bankruptcy")?.intendedAudience?.roleId).toBe(
      "generic.advisor",
    );
  });

  it("clears intended audience when share intent is not yes", async () => {
    const repo = new InMemoryCaseCustomerContextRepository();

    await persistCaseCustomerContextIntake(repo, {
      userId: "user-1",
      caseId: "case-1",
      intake: {
        domains: [
          {
            domainId: "not-a-pack",
            objective: "Help me understand services",
            shareIntent: "yes",
            intendedAudienceRoleId: "generic.family",
          },
        ],
      },
    });

    await persistCaseCustomerContextIntake(repo, {
      userId: "user-1",
      caseId: "case-1",
      intake: {
        domains: [
          { domainId: "not-a-pack", objective: "Help me understand services", shareIntent: "not_sure" },
        ],
      },
    });

    const active = await repo.listActiveByCase("case-1");
    expect(active.some((row) => row.contextType === "INTENDED_AUDIENCE")).toBe(false);
  });

  it("persists pack role id, label, and domain pack version after resolution", async () => {
    const repo = new InMemoryCaseCustomerContextRepository();

    await persistCaseCustomerContextIntake(repo, {
      userId: "user-1",
      caseId: "case-1",
      intake: {
        domains: [
          {
            domainId: "iep",
            objective: "Prepare for a meeting",
            shareIntent: "yes",
            intendedAudienceRoleId: "school_team",
          },
        ],
      },
    });

    const audience = await repo.getActiveByCaseAndType("case-1", "INTENDED_AUDIENCE", "iep");
    expect(audience?.valueJson).toEqual({
      roleId: "school_team",
      label: "School/team",
      domainPackId: "hive.domain.iep",
      domainPackVersion: "0.0.0-scaffold",
    });
  });

  it("rejects pack roles before domain resolution and requires other text", async () => {
    const repo = new InMemoryCaseCustomerContextRepository();

    await expect(
      persistCaseCustomerContextIntake(repo, {
        userId: "user-1",
        caseId: "case-1",
        intake: {
          domains: [
            {
              domainId: "not-a-pack",
              objective: "Prepare for a meeting",
              shareIntent: "yes",
              intendedAudienceRoleId: "school_team",
            },
          ],
        },
      }),
    ).rejects.toThrow("INTENDED_AUDIENCE_UNKNOWN_ROLE");

    await expect(
      persistCaseCustomerContextIntake(repo, {
        userId: "user-1",
        caseId: "case-1",
        intake: {
          domains: [
            {
              domainId: "iep",
              objective: "Prepare for a meeting",
              shareIntent: "yes",
              intendedAudienceRoleId: "other",
            },
          ],
        },
      }),
    ).rejects.toThrow("INTENDED_AUDIENCE_OTHER_TEXT_REQUIRED");

    await persistCaseCustomerContextIntake(repo, {
      userId: "user-1",
      caseId: "case-1",
      intake: {
        domains: [
          {
            domainId: "iep",
            objective: "Prepare for a meeting",
            shareIntent: "yes",
            intendedAudienceRoleId: "other",
            intendedAudienceOtherRole: "Coach",
          },
        ],
      },
    });
    const audience = await repo.getActiveByCaseAndType("case-1", "INTENDED_AUDIENCE", "iep");
    expect(audience?.valueJson).toEqual({
      roleId: "other",
      label: "Other",
      domainPackId: "hive.domain.iep",
      domainPackVersion: "0.0.0-scaffold",
      otherRoleText: "Coach",
    });
  });

  it("reads legacy audience ids without a pack version", () => {
    const snapshot = buildCaseCustomerContextSnapshot([
      {
        id: "obj",
        userId: "user-1",
        caseId: "case-1",
        domainId: "iep",
        contextType: "OBJECTIVE",
        valueJson: { text: "Understand services" },
        source: "CUSTOMER_ASSERTION",
        createdAt: "2026-09-28T00:00:00.000Z",
        supersededAt: null,
      },
      {
        id: "aud",
        userId: "user-1",
        caseId: "case-1",
        domainId: "iep",
        contextType: "INTENDED_AUDIENCE",
        valueJson: { audience: "attorney", otherRoleText: "  " },
        source: "CUSTOMER_ASSERTION",
        createdAt: "2026-09-28T00:00:00.000Z",
        supersededAt: null,
      },
    ]);
    expect(snapshot?.domains[0]?.intendedAudience).toEqual({
      roleId: "attorney",
      label: "Attorney",
      domainPackId: null,
      domainPackVersion: null,
    });
    expect(snapshot?.domains[0]?.intendedAudienceOtherRole).toBeUndefined();
  });
});
