import type { CanonicalCaseSnapshot } from "@hiveforyou/shared/case-intelligence/3";
import type { CaseCustomerContextSnapshot } from "@hiveforyou/shared/case-customer-context";
import type { CustomerView, ProView } from "@hiveforyou/shared/projections";
import { CUSTOMER_VIEW_SCHEMA, PRO_VIEW_SCHEMA } from "@hiveforyou/shared/projections";

import type { CaseProjectionRepository } from "../persistence/case-projection-repository";
import { customerContextForEngine2 } from "../persistence/case-customer-context-repository";
import { projectCustomerViewV3 } from "./project-customer-view-v3";
import { projectProViewV3 } from "./project-pro-view-v3";
import { validateCustomerViewNarrativeClaims } from "./validate-projection-narrative";

export type BuiltCaseProjectionsV3 = {
  customerView: CustomerView;
  proView: ProView;
};

export function buildCaseProjectionsV3(input: {
  intelligence: CanonicalCaseSnapshot;
  customerContext?: CaseCustomerContextSnapshot | null;
}): BuiltCaseProjectionsV3 {
  const engine2Context = customerContextForEngine2(
    input.customerContext,
    input.intelligence.domainId,
  );
  const customerView = projectCustomerViewV3({
    intelligence: input.intelligence,
    customerContext: engine2Context,
  });
  const validatedClaimIds = new Set(input.intelligence.claims.map((claim) => claim.id));
  const issues = validateCustomerViewNarrativeClaims(customerView, validatedClaimIds);
  if (issues.length) {
    throw new Error("CUSTOMER_VIEW_NARRATIVE_INVALID");
  }
  const proView = projectProViewV3(input.intelligence);
  return { customerView, proView };
}

export async function persistCaseProjectionsV3(
  repo: CaseProjectionRepository,
  input: {
    intelligence: CanonicalCaseSnapshot;
    customerContext?: CaseCustomerContextSnapshot | null;
  },
): Promise<BuiltCaseProjectionsV3> {
  const built = buildCaseProjectionsV3(input);
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
