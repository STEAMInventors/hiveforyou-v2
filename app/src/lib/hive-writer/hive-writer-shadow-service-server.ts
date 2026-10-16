import "server-only";

import {
  buildHiveWriterShadowIdempotencyKey,
  enqueueHiveWriterShadowPreviewRequest,
  loadLatestAcceptedWriterShadowRecord,
  loadWriterShadowRecordByRunId,
  projectCanonicalStudyReport,
  resolveHiveWriterDomainBinding,
  resolveWriterHiveUiTreeForPreview,
  type WriterHiveUiPreviewResolution,
} from "@hiveforyou/core";
import type { CanonicalStudyDebugArtifactMetadata } from "@hiveforyou/core";
import type { CanonicalStudyReportAudience } from "@hiveforyou/shared/canonical-study-report-projection";
import type { HiveWriterShadowRecord } from "@hiveforyou/shared/hive-writer-proposal";

import { loadDeterministicCanonicalStudyArtifactForSession } from "@/lib/canonical-debug/run-deterministic-canonical-study-server";
import { emitWriterShadowRequestedEvent } from "@/lib/hive-writer/emit-writer-shadow-requested";
import { SupabaseStudyContextRepository } from "@/lib/persistence/supabase-repositories";
import { SupabaseStudyArtifactRepository } from "@/lib/persistence/supabase-study-artifacts";
import { createAuthenticatedHiveGateway, getAuthenticatedUserId } from "@/lib/supabase/server";
import { loadDeterministicCanonicalStudyArtifact, requireSessionUserId } from "@hiveforyou/core";

const STORAGE_BUCKET = "document-pages";

export type HiveWriterShadowDiagnostic = {
  writerRunId: string;
  status: HiveWriterShadowRecord["status"];
  idempotencyKey: string;
  validation: HiveWriterShadowRecord["validation"];
  observability: Pick<
    HiveWriterShadowRecord["observability"],
    "durationMs" | "modelIdentifier" | "projectionHash"
  >;
};

function toHiveWriterShadowDiagnostic(record: HiveWriterShadowRecord): HiveWriterShadowDiagnostic {
  return {
    writerRunId: record.writerRunId,
    status: record.status,
    idempotencyKey: record.idempotencyKey,
    validation: record.validation,
    observability: {
      durationMs: record.observability.durationMs,
      modelIdentifier: record.observability.modelIdentifier,
      projectionHash: record.observability.projectionHash,
    },
  };
}

async function loadProjectionBindingForSession(input: {
  caseId: string;
  studyRunId: string;
  audience: CanonicalStudyReportAudience;
}): Promise<{
  userId: string;
  gateway: Awaited<ReturnType<typeof createAuthenticatedHiveGateway>>;
  artifact: Awaited<ReturnType<typeof loadDeterministicCanonicalStudyArtifactForSession>>;
  projection: ReturnType<typeof projectCanonicalStudyReport>;
  idempotencyKey: string;
}> {
  const gateway = await createAuthenticatedHiveGateway();
  const userId = requireSessionUserId(await getAuthenticatedUserId());
  const artifact = await loadDeterministicCanonicalStudyArtifactForSession({
    caseId: input.caseId,
    studyRunId: input.studyRunId,
  });
  const metadata = artifact as typeof artifact & CanonicalStudyDebugArtifactMetadata;
  const projection = projectCanonicalStudyReport({
    artifact,
    audience: input.audience,
    customerProReportsPermitted: metadata.customerProReportsPermitted,
    packApprovalLabel: metadata.packApprovalLabel,
  });
  const domainBinding = resolveHiveWriterDomainBinding({ artifact, projection });
  const idempotencyKey = buildHiveWriterShadowIdempotencyKey({
    caseId: projection.caseId,
    studyRunId: projection.studyRunId,
    audience: projection.audience,
    packContentSha256: domainBinding.packContentSha256,
    reportProjectionContentSha256: domainBinding.reportProjectionContentSha256,
  });
  return { userId, gateway, artifact, projection, idempotencyKey };
}

/** Enqueue a Writer shadow run. The Next.js process does not call hive-agents. */
export async function runHiveWriterShadowForSession(input: {
  caseId: string;
  studyRunId: string;
  audience: CanonicalStudyReportAudience;
}): Promise<HiveWriterShadowDiagnostic> {
  const gateway = await createAuthenticatedHiveGateway();
  const userId = requireSessionUserId(await getAuthenticatedUserId());
  const studyArtifactRepo = new SupabaseStudyArtifactRepository(gateway, userId);
  const contextRepo = new SupabaseStudyContextRepository(gateway, userId);

  const record = await enqueueHiveWriterShadowPreviewRequest({
    claimedUserId: userId,
    caseId: input.caseId,
    studyRunId: input.studyRunId,
    audience: input.audience,
    env: process.env,
    gateway,
    loadArtifact: (ownerUserId) =>
      loadDeterministicCanonicalStudyArtifact({
        userId: ownerUserId,
        studyRunId: input.studyRunId,
        storage: gateway,
        studyArtifactRepo,
        contextRepo,
      }),
    dispatchRequested: emitWriterShadowRequestedEvent,
  });

  return toHiveWriterShadowDiagnostic(record);
}

export async function loadHiveWriterShadowDiagnosticForSession(input: {
  caseId: string;
  studyRunId: string;
  audience: CanonicalStudyReportAudience;
  writerRunId: string;
}): Promise<HiveWriterShadowDiagnostic | null> {
  const { userId, gateway } = await loadProjectionBindingForSession(input);
  const record = await loadWriterShadowRecordByRunId({
    gateway,
    bucket: STORAGE_BUCKET,
    userId,
    studyRunId: input.studyRunId,
    audience: input.audience,
    writerRunId: input.writerRunId,
  });
  return record ? toHiveWriterShadowDiagnostic(record) : null;
}

export type WriterHiveUiTreePreviewPayload = WriterHiveUiPreviewResolution;

/** Read-only: latest accepted Writer layout; never invokes the Writer model. */
export async function loadWriterHiveUiTreePreviewForSession(input: {
  caseId: string;
  studyRunId: string;
  audience: CanonicalStudyReportAudience;
}): Promise<WriterHiveUiTreePreviewPayload> {
  const { userId, gateway, artifact, projection, idempotencyKey } =
    await loadProjectionBindingForSession(input);
  const record = await loadLatestAcceptedWriterShadowRecord({
    gateway,
    bucket: STORAGE_BUCKET,
    userId,
    studyRunId: input.studyRunId,
    audience: input.audience,
    projectionBindingKey: idempotencyKey,
  });
  return resolveWriterHiveUiTreeForPreview({
    artifact,
    projection,
    record,
  });
}
