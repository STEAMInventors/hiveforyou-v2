import "server-only";

import {
  buildCaseProvenanceBundleV3,
  loadCaseCustomerContextSnapshot,
  persistCaseProjectionsV3,
  projectCaseViewV2Minimal,
  requireSessionUserId,
} from "@hiveforyou/core";
import { getCaseMapProjectionByDomainId } from "@hiveforyou/domain-packs";
import type { CaseMap, CaseViewV2, ProView } from "@hiveforyou/shared/projections";
import { CASE_MAP_SCHEMA, CASE_VIEW_V2_SCHEMA } from "@hiveforyou/shared/projections";

import { CaseNotFoundError } from "@/lib/canonical-study/study-service-server";
import { readServerEnv } from "@/lib/env/server-env";
import { enrichCaseViewWithValidatedStory } from "@/lib/story/story-writer-from-env.server";
import { loadCanonicalCaseByStudyRunId } from "@/lib/case/load-case-by-study-run";
import type { CaseMapViewBundle } from "@/lib/case-map/case-map-view-bundle";
import { createSupabaseHiveGateway } from "@/lib/persistence/hive-gateway";
import {
  loadLatestStructureMapForCase,
  SupabaseCaseProjectionRepository,
} from "@/lib/persistence/supabase-case-projections";
import { SupabaseCaseRepository, SupabaseStudyRunRepository } from "@/lib/persistence/supabase-repositories";
import { SupabaseCaseCustomerContextRepository } from "@/lib/persistence/supabase-case-customer-context";
import { createServerSupabaseClient, getAuthenticatedUserId } from "@/lib/supabase/server";

export class StudyRunNotFoundError extends Error {
  readonly code = "STUDY_RUN_NOT_FOUND";

  constructor() {
    super("Study run was not found.");
    this.name = "StudyRunNotFoundError";
  }
}

export async function loadCaseMapViewBundle(studyRunId: string): Promise<CaseMapViewBundle> {
  const sessionUserId = requireSessionUserId(await getAuthenticatedUserId());
  const gateway = createSupabaseHiveGateway(await createServerSupabaseClient());
  const runRepo = new SupabaseStudyRunRepository(gateway, sessionUserId);
  const run = await runRepo.getByStudyRunId(studyRunId);
  if (!run) {
    throw new StudyRunNotFoundError();
  }

  const cases = new SupabaseCaseRepository(gateway, sessionUserId);
  const ownedCase = await cases.getById(sessionUserId, run.caseId);
  if (!ownedCase) {
    throw new CaseNotFoundError();
  }

  const base: CaseMapViewBundle = {
    studyRunId: run.studyRunId,
    caseId: run.caseId,
    status: run.status,
    errorCode: run.errorCode,
    caseMap: null,
    provenance: null,
    proView: null,
    caseView: null,
    canonicalSnapshot: null,
  };

  if (run.status === "RUNNING") {
    return base;
  }

  const snapshot = await loadCanonicalCaseByStudyRunId({
    gateway,
    userId: sessionUserId,
    studyRunId,
  });

  if (!snapshot) {
    return base;
  }

  const projectionRepo = new SupabaseCaseProjectionRepository(gateway, sessionUserId);
  let caseMap = (await projectionRepo.getByVersionAndKind(
    run.caseId,
    snapshot.version,
    "case_map",
  )) as CaseMap | null;

  let proView = (await projectionRepo.getByVersionAndKind(
    run.caseId,
    snapshot.version,
    "pro",
  )) as ProView | null;

  let caseView = (await projectionRepo.getByVersionAndKind(
    run.caseId,
    snapshot.version,
    "case_view",
  )) as CaseViewV2 | null;

  const customerContextRepo = new SupabaseCaseCustomerContextRepository(gateway, sessionUserId);
  const customerContext = await loadCaseCustomerContextSnapshot(
    customerContextRepo,
    run.caseId,
  );

  const structureMap = await loadLatestStructureMapForCase(gateway, sessionUserId, run.caseId);
  const logicalDocuments = structureMap?.logicalDocuments;

  if (!caseMap || !proView || !caseView) {
    const built = await persistCaseProjectionsV3(projectionRepo, {
      intelligence: snapshot,
      customerContext,
      caseMapProjection: getCaseMapProjectionByDomainId(snapshot.domainId),
      logicalDocuments,
    });
    caseMap = built.caseMap;
    proView = built.proView;
    caseView = built.caseView;
  }

  if (caseMap.schemaVersion !== CASE_MAP_SCHEMA) {
    throw new Error("CASE_MAP_SCHEMA_MISMATCH");
  }

  const provenance = buildCaseProvenanceBundleV3({
    intelligence: snapshot,
    structureMap,
  });

  const storedValidatedStory = caseView?.validatedStory ?? null;

  const needsCaseViewRebuild =
    !caseView ||
    caseView.schemaVersion !== CASE_VIEW_V2_SCHEMA ||
    (caseView.packNarrative == null && caseView.validatedStory?.kind !== "prose") ||
    (caseView.plan.cards.length === 0 && (logicalDocuments?.length ?? 0) > 0);

  if (needsCaseViewRebuild) {
    caseView = projectCaseViewV2Minimal({
      intelligence: snapshot,
      provenance,
      customerContext,
      logicalDocuments,
    });
    if (storedValidatedStory?.kind === "prose") {
      caseView = { ...caseView, validatedStory: storedValidatedStory };
    }
  }

  const env = readServerEnv();
  const enriched = await enrichCaseViewWithValidatedStory({
    caseView: caseView!,
    intelligence: snapshot,
    env,
    intent: caseView!.header.askedText ?? null,
  });
  caseView = enriched;

  return {
    ...base,
    caseMap,
    provenance,
    proView,
    caseView,
    canonicalSnapshot: snapshot,
  };
}
