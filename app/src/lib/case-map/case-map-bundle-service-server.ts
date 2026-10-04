import "server-only";

import { buildCaseProvenanceBundleV3, loadCaseCustomerContextSnapshot, requireSessionUserId } from "@hiveforyou/core";
import type { CaseMap, CaseViewV2, ProView } from "@hiveforyou/shared/projections";
import { CASE_MAP_SCHEMA, CASE_VIEW_V2_SCHEMA } from "@hiveforyou/shared/projections";
import { isStudyRunProcessing } from "@hiveforyou/shared/canonical-study";

import { CaseNotFoundError } from "@/lib/canonical-study/study-service-server";
import { loadCanonicalCaseByStudyRunId } from "@/lib/case/load-case-by-study-run";
import type { CaseMapViewBundle } from "@/lib/case-map/case-map-view-bundle";
import { emitStudyRequestedEvent } from "@/lib/intake/emit-study-requested";
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

const regenerationInFlight = new Set<string>();

async function requestProjectionRegeneration(
  run: NonNullable<Awaited<ReturnType<SupabaseStudyRunRepository["getByStudyRunId"]>>>,
  userId: string,
): Promise<void> {
  if (!run.intakeRunId?.trim()) {
    return;
  }
  if (run.status !== "SUCCEEDED" && run.status !== "NEEDS_REVIEW") {
    return;
  }
  const key = run.studyRunId;
  if (regenerationInFlight.has(key)) {
    return;
  }
  regenerationInFlight.add(key);
  try {
    await emitStudyRequestedEvent(run, userId);
  } catch {
    // best-effort; page shows preparing state
  } finally {
    regenerationInFlight.delete(key);
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
    projectionsPending: false,
    studyStartedAt: run.startedAt,
  };

  if (isStudyRunProcessing(run.status)) {
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
  const caseMap = (await projectionRepo.getByVersionAndKind(
    run.caseId,
    snapshot.version,
    "case_map",
  )) as CaseMap | null;

  const proView = (await projectionRepo.getByVersionAndKind(
    run.caseId,
    snapshot.version,
    "pro",
  )) as ProView | null;

  const caseView = (await projectionRepo.getByVersionAndKind(
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

  if (!caseMap || !proView || !caseView) {
    void requestProjectionRegeneration(run, sessionUserId);
    return {
      ...base,
      canonicalSnapshot: snapshot,
      projectionsPending: true,
    };
  }

  if (caseMap.schemaVersion !== CASE_MAP_SCHEMA) {
    throw new Error("CASE_MAP_SCHEMA_MISMATCH");
  }

  if (caseView.schemaVersion !== CASE_VIEW_V2_SCHEMA) {
    void requestProjectionRegeneration(run, sessionUserId);
    return {
      ...base,
      caseMap,
      proView,
      canonicalSnapshot: snapshot,
      projectionsPending: true,
    };
  }

  const provenance = buildCaseProvenanceBundleV3({
    intelligence: snapshot,
    structureMap,
  });

  void customerContext;

  return {
    ...base,
    caseMap,
    provenance,
    proView,
    caseView,
    canonicalSnapshot: snapshot,
  };
}
