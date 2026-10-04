import type { CaseIntelligenceSnapshot } from "@hiveforyou/canonical";
import type {
  CaseCustomerContextSnapshot,
  DomainCustomerContext,
} from "@hiveforyou/shared/case-customer-context";

/**
 * Inputs for Customer Report projection — canonical truth plus customer emphasis/audience.
 * Pro projection must use canonical intelligence only (no audience/share shaping).
 */
export type CustomerReportProjectionInput = {
  caseIntelligence: CaseIntelligenceSnapshot;
  customerContext: Pick<
    DomainCustomerContext,
    "domainId" | "objective" | "intendedAudience" | "intendedAudienceOtherRole"
  >;
};

export function buildCustomerReportProjectionInput(input: {
  caseIntelligence: CaseIntelligenceSnapshot;
  customerContext: CaseCustomerContextSnapshot | null;
}): CustomerReportProjectionInput | null {
  const domain = input.customerContext?.domains.find(
    (item) => item.domainId === input.caseIntelligence.domainId,
  );
  if (!domain) {
    return null;
  }
  return {
    caseIntelligence: input.caseIntelligence,
    customerContext: {
      domainId: domain.domainId,
      objective: domain.objective,
      intendedAudience: domain.intendedAudience,
      intendedAudienceOtherRole: domain.intendedAudienceOtherRole,
    },
  };
}
