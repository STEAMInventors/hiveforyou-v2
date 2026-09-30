import "server-only";

import {
  buildCaseProvenanceBundleV3,
  loadCaseCustomerContextSnapshot,
  persistCaseProjectionsV3,
  requireSessionUserId,
} from "@hiveforyou/core";
import type { CustomerView, ProView } from "@hiveforyou/shared/projections";

import { CaseNotFoundError } from "@/lib/canonical-study/study-service-server";
import type { CaseViewBundle } from "@/lib/case/case-view-bundle";
import { loadLatestCanonicalCaseIntelligence } from "@/lib/case/load-latest-canonical-case";
import { createSupabaseHiveGateway } from "@/lib/persistence/hive-gateway";
import {
  loadLatestStructureMapForCase,
  SupabaseCaseProjectionRepository,
} from "@/lib/persistence/supabase-case-projections";
import { SupabaseCaseRepository } from "@/lib/persistence/supabase-repositories";
import { SupabaseCaseCustomerContextRepository } from "@/lib/persistence/supabase-case-customer-context";
import { createServerSupabaseClient, getAuthenticatedUserId } from "@/lib/supabase/server";

const emptyCustomerView = (caseId: string): CustomerView => ({
  schemaVersion: "customer-view/1",
  caseId,
  intelligenceVersion: 0,
  domainIds: [],
  sections: [],
});

const emptyProView = (caseId: string): ProView => ({
  schemaVersion: "pro-view/1",
  caseId,
  intelligenceVersion: 0,
  domainIds: [],
  entities: [],
  claims: [],
  claimEvidence: [],
  relationships: [],
  events: [],
  conflicts: [],
  missingness: [],
});

export async function loadCaseViewBundle(input: {
  caseId: string;
  intelligenceVersion?: number;
}): Promise<CaseViewBundle> {
  const sessionUserId = requireSessionUserId(await getAuthenticatedUserId());
  const gateway = createSupabaseHiveGateway(await createServerSupabaseClient());
  const cases = new SupabaseCaseRepository(gateway, sessionUserId);
  const ownedCase = await cases.getById(sessionUserId, input.caseId);
  if (!ownedCase) {
    throw new CaseNotFoundError();
  }

  const projectionRepo = new SupabaseCaseProjectionRepository(gateway, sessionUserId);
  const intelligence = await loadLatestCanonicalCaseIntelligence({
    gateway,
    userId: sessionUserId,
    caseId: input.caseId,
    intelligenceVersion: input.intelligenceVersion,
  });

  if (!intelligence) {
    return {
      caseId: input.caseId,
      intelligenceVersion: 0,
      intelligenceSchema: "case-intelligence/3",
      customerView: emptyCustomerView(input.caseId),
      proView: emptyProView(input.caseId),
      provenance: {
        schemaVersion: "case-provenance-bundle/1",
        caseId: input.caseId,
        intelligenceVersion: 0,
        claims: [],
      },
      structureMap: null,
      sourceDocuments: [],
      studyStatus: "unavailable",
      canonicalSnapshot: null,
    };
  }

  const customerContextRepo = new SupabaseCaseCustomerContextRepository(
    gateway,
    sessionUserId,
  );
  const customerContext = await loadCaseCustomerContextSnapshot(
    customerContextRepo,
    input.caseId,
  );

  let customerView = (await projectionRepo.getByVersionAndKind(
    input.caseId,
    intelligence.version,
    "customer",
  )) as CustomerView | null;
  let proView = (await projectionRepo.getByVersionAndKind(
    input.caseId,
    intelligence.version,
    "pro",
  )) as ProView | null;

  if (!customerView || !proView) {
    const built = await persistCaseProjectionsV3(projectionRepo, {
      intelligence,
      customerContext,
    });
    customerView = built.customerView;
    proView = built.proView;
  }

  const structureMap = await loadLatestStructureMapForCase(
    gateway,
    sessionUserId,
    input.caseId,
  );
  const provenance = buildCaseProvenanceBundleV3({
    intelligence,
    structureMap,
  });

  return {
    caseId: input.caseId,
    intelligenceVersion: intelligence.version,
    intelligenceSchema: "case-intelligence/3",
    customerView,
    proView,
    provenance,
    structureMap,
    sourceDocuments: intelligence.sourceDocuments,
    studyStatus: "ready",
    canonicalSnapshot: intelligence,
  };
}
