import { describe, expect, it } from "vitest";

import type { CaseIntelligenceSnapshot } from "@hiveforyou/canonical";
import type { CaseCustomerContextSnapshot } from "@hiveforyou/shared/case-customer-context";

import { buildCustomerReportProjectionInput } from "./customer-report-context";

describe("customer report projection input", () => {
  it("combines canonical intelligence with objective and audience only", () => {
    const intelligence = {
      schemaVersion: "case-intelligence/2",
      version: 1,
      caseId: "case-1",
      studyRunId: "run-1",
      createdAt: new Date().toISOString(),
      caseScope: "single_domain",
      domainId: "iep",
      domainPackId: "iep-pack",
      domainPackVersion: "1",
      sourceDocuments: [],
      entities: [],
      claims: [],
      claimEvidence: [],
      relationships: [],
      events: [],
      conflicts: [],
      missingness: [],
      derivedClaims: [],
      analysisIntent: { choiceIds: [] },
      userContext: null,
      validationResult: { ok: true, accepted: { entities: [], claims: [], relationships: [], events: [], conflicts: [], missingness: [], derivedClaimCandidates: [] }, rejected: { claims: [], derivedClaimCandidates: [] } },
    } as CaseIntelligenceSnapshot;
    const before = structuredClone(intelligence);
    const customerContext: CaseCustomerContextSnapshot = {
      source: "CUSTOMER_ASSERTION",
      domains: [
        {
          domainId: "iep",
          objective: "Understand placement options",
          objectiveCapturedAt: new Date().toISOString(),
          shareIntent: "yes",
          intendedAudience: {
            roleId: "attorney",
            label: "Attorney",
            domainPackId: "hive.domain.iep",
            domainPackVersion: "0.0.0-scaffold",
          },
        },
      ],
    };

    const input = buildCustomerReportProjectionInput({ caseIntelligence: intelligence, customerContext });
    expect(intelligence).toEqual(before);
    expect(input?.customerContext.objective).toBe("Understand placement options");
    expect(input?.customerContext.intendedAudience).toEqual({
      roleId: "attorney",
      label: "Attorney",
      domainPackId: "hive.domain.iep",
      domainPackVersion: "0.0.0-scaffold",
    });
    expect(input?.caseIntelligence.caseId).toBe("case-1");
  });
});
