import type { CanonicalCaseSnapshot } from "@hiveforyou/shared/case-intelligence/3";
import type { CaseCustomerContextSnapshot } from "@hiveforyou/shared/case-customer-context";
import type { CanonicalStudyContext } from "@hiveforyou/shared/canonical-study";
import type { CaseMap, CaseView, CaseViewV2, CustomerView, ProView } from "@hiveforyou/shared/projections";
import {
  CASE_MAP_SCHEMA,
  CASE_VIEW_V2_SCHEMA,
  CUSTOMER_VIEW_SCHEMA,
  PRO_VIEW_SCHEMA,
} from "@hiveforyou/shared/projections";
import type { CaseMapProjectionPackSnapshot } from "@hiveforyou/domain-pack";

import type { CaseProjectionRepository } from "../persistence/case-projection-repository";
import { customerContextForEngine2 } from "../persistence/case-customer-context-repository";
import { projectCustomerViewV3 } from "./project-customer-view-v3";
import { projectCaseMapV3 } from "./project-case-map-v3";
import { projectCaseViewV2Minimal } from "./project-case-view-v2-minimal";
import { projectProViewV3 } from "./project-pro-view-v3";
import { validateCustomerViewNarrativeClaims } from "./validate-projection-narrative";

export type BuiltCaseProjectionsV3 = {
  customerView: CustomerView;
  proView: ProView;
  caseMap: CaseMap;
  caseView: CaseViewV2;
};

export function buildCaseProjectionsV3(input: {
  intelligence: CanonicalCaseSnapshot;
  customerContext?: CaseCustomerContextSnapshot | null;
  caseMapProjection?: CaseMapProjectionPackSnapshot;
  statedWorkPurpose?: string | null;
  provenance?: import("@hiveforyou/shared/projections").CaseProvenanceBundle | null;
  logicalDocuments?: CanonicalStudyContext["logicalDocuments"];
  proposalSchema?: CaseView["proposalSchema"];
  voiceProposal?: import("@hiveforyou/shared/projections").VoiceProposal | null;
  userText?: string | null;
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
  const caseMap = projectCaseMapV3({
    intelligence: input.intelligence,
    packProjection: input.caseMapProjection ?? {
      domainId: input.intelligence.domainId,
      domainPackId: input.intelligence.domainPackId,
      domainPackVersion: input.intelligence.domainPackVersion,
      fallbackZoneLabel: "Other understanding",
      rootLabel: "Case",
      zones: [],
    },
  });
  const caseView = projectCaseViewV2Minimal({
    intelligence: input.intelligence,
    provenance: input.provenance,
    customerContext: input.customerContext,
    statedWorkPurpose: input.statedWorkPurpose,
    logicalDocuments: input.logicalDocuments,
    proposalSchema: input.proposalSchema,
    voiceProposal: input.voiceProposal,
    userText: input.userText,
  });
  return { customerView, proView, caseMap, caseView };
}

export async function persistCaseProjectionsV3(
  repo: CaseProjectionRepository,
  input: {
    intelligence: CanonicalCaseSnapshot;
    customerContext?: CaseCustomerContextSnapshot | null;
    caseMapProjection?: CaseMapProjectionPackSnapshot;
    statedWorkPurpose?: string | null;
    logicalDocuments?: CanonicalStudyContext["logicalDocuments"];
    provenance?: import("@hiveforyou/shared/projections").CaseProvenanceBundle | null;
    builtOverride?: BuiltCaseProjectionsV3;
    proposalSchema?: CaseView["proposalSchema"];
  },
): Promise<BuiltCaseProjectionsV3> {
  const built = input.builtOverride ?? buildCaseProjectionsV3(input);
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
  await repo.save({
    caseId: built.caseMap.caseId,
    intelligenceVersion: built.caseMap.intelligenceVersion,
    projectionKind: "case_map",
    schemaVersion: CASE_MAP_SCHEMA,
    projection: built.caseMap,
  });
  await repo.save({
    caseId: built.caseView.caseId,
    intelligenceVersion: input.intelligence.version,
    projectionKind: "case_view",
    schemaVersion: CASE_VIEW_V2_SCHEMA,
    projection: built.caseView,
  });
  return built;
}
