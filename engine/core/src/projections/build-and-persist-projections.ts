import type { CaseIntelligenceSnapshot } from "@hiveforyou/canonical";
import type { CaseCustomerContextSnapshot } from "@hiveforyou/shared/case-customer-context";
import type { CustomerView, ProView } from "@hiveforyou/shared/projections";
import { CUSTOMER_VIEW_SCHEMA, PRO_VIEW_SCHEMA } from "@hiveforyou/shared/projections";

import type { CaseProjectionRepository } from "../persistence/case-projection-repository";
import { customerContextForEngine2 } from "../persistence/case-customer-context-repository";
import { projectCustomerView } from "./project-customer-view";
import { projectProView } from "./project-pro-view";
import { validateCustomerViewNarrativeClaims } from "./validate-projection-narrative";

export type BuiltCaseProjections = {
  customerView: CustomerView;
  proView: ProView;
};

export function buildCaseProjections(input: {
  intelligence: CaseIntelligenceSnapshot;
  customerContext?: CaseCustomerContextSnapshot | null;
}): BuiltCaseProjections {
  const engine2Context = customerContextForEngine2(
    input.customerContext,
    input.intelligence.domainId,
  );
  const customerView = projectCustomerView({
    intelligence: input.intelligence,
    customerContext: engine2Context,
  });
  const validatedClaimIds = new Set(input.intelligence.claims.map((claim) => claim.id));
  const issues = validateCustomerViewNarrativeClaims(customerView, validatedClaimIds);
  if (issues.length) {
    throw new Error("CUSTOMER_VIEW_NARRATIVE_INVALID");
  }
  const proView = projectProView(input.intelligence);
  return { customerView, proView };
}

export async function persistCaseProjections(
  repo: CaseProjectionRepository,
  input: {
    intelligence: CaseIntelligenceSnapshot;
    customerContext?: CaseCustomerContextSnapshot | null;
  },
): Promise<BuiltCaseProjections> {
  const built = buildCaseProjections(input);
  await repo.save({
    caseId: built.customerView.caseId,
    intelligenceVersion: built.customerView.intelligenceVersion,
    projectionKind: "customer",
    schemaVersion: CUSTOMER_VIEW_SCHEMA,
    projection: built.customerView,
  });
  await repo.save({
    caseId: built.proView.caseId,
    intelligenceVersion: built.proView.intelligenceVersion,
    projectionKind: "pro",
    schemaVersion: PRO_VIEW_SCHEMA,
    projection: built.proView,
  });
  return built;
}
