import "server-only";

import {
  buildHiveWriterShadowIdempotencyKey,
  enqueueHiveWriterShadowPreviewRequest,
  isHiveWriterShadowTerminalStatus,
  loadDeterministicCanonicalStudyArtifact,
  projectCanonicalStudyReport,
  resolveHiveWriterDomainBinding,
  resolveWriterHiveUiTreeForPreview,
  type HiveWriterShadowPersistence,
  type WriterHiveUiPreviewResolution,
} from "@hiveforyou/core";
import type { CanonicalStudyDebugArtifactMetadata } from "@hiveforyou/core";
import type { CanonicalStudyReportAudience } from "@hiveforyou/shared/canonical-study-report-projection";
import { hiveWriterShadowRecordPath } from "@hiveforyou/shared/hive-artifact-paths";
import {
  parseHiveWriterShadowRecord,
  type HiveWriterShadowRecord,
} from "@hiveforyou/shared/hive-writer-proposal";

import { loadDeterministicCanonicalStudyArtifactForSession } from "@/lib/canonical-debug/run-deterministic-canonical-study-server";
import { emitWriterShadowRequestedEvent } from "@/lib/hive-writer/emit-writer-shadow-requested";
import { SupabaseStudyContextRepository } from "@/lib/persistence/supabase-repositories";
import { SupabaseStudyArtifactRepository } from "@/lib/persistence/supabase-study-artifacts";
import { createAuthenticatedHiveGateway, getAuthenticatedUserId } from "@/lib/supabase/server";
import { requireSessionUserId } from "@hiveforyou/core";

const STORAGE_BUCKET = "document-pages";

export type HiveWriterShadowDiagnostic = {
  status: HiveWriterShadowRecord["status"];
  idempotencyKey: string;
  validation: HiveWriterShadowRecord["validation"];
  observability: Pick<
    HiveWriterShadowRecord["observability"],
    "durationMs" | "modelIdentifier" | "projectionHash"
  >;
};

function createShadowPersistence(input: {
  userId: string;
  studyRunId: string;
  audience: CanonicalStudyReportAudience;
  gateway: Awaited<ReturnType<typeof createAuthenticatedHiveGateway>>;
}): HiveWriterShadowPersistence {
  return {
    load: async (idempotencyKey) => {
      const path = hiveWriterShadowRecordPath(
        input.userId,
        input.studyRunId,
        input.audience,
        idempotencyKey,
      );
      try {
        const bytes = await input.gateway.downloadObject(STORAGE_BUCKET, path);
        return parseHiveWriterShadowRecord(JSON.parse(new TextDecoder().decode(bytes)));
      } catch {
        return null;
      }
    },
    save: async (record) => {
      const path = hiveWriterShadowRecordPath(
        input.userId,
        input.studyRunId,
        record.audience,
        record.idempotencyKey,
      );
      try {
        const existingBytes = await input.gateway.downloadObject(STORAGE_BUCKET, path);
        const existing = parseHiveWriterShadowRecord(
          JSON.parse(new TextDecoder().decode(existingBytes)),
        );
        if (isHiveWriterShadowTerminalStatus(existing.status)) {
          return;
        }
      } catch {
        // Missing object — first write for this idempotency key.
      }
      const bytes = new TextEncoder().encode(JSON.stringify(record));
      await input.gateway.uploadObject(STORAGE_BUCKET, path, bytes, "application/json", {
        upsert: true,
      });
    },
  };
}

function toHiveWriterShadowDiagnostic(record: HiveWriterShadowRecord): HiveWriterShadowDiagnostic {
  return {
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
}): Promise<HiveWriterShadowDiagnostic | null> {
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
  const path = hiveWriterShadowRecordPath(userId, input.studyRunId, input.audience, idempotencyKey);
  try {
    const bytes = await gateway.downloadObject(STORAGE_BUCKET, path);
    const record = parseHiveWriterShadowRecord(JSON.parse(new TextDecoder().decode(bytes)));
    return {
      status: record.status,
      idempotencyKey: record.idempotencyKey,
      validation: record.validation,
      observability: {
        durationMs: record.observability.durationMs,
        modelIdentifier: record.observability.modelIdentifier,
        projectionHash: record.observability.projectionHash,
      },
    };
  } catch {
    return null;
  }
}

async function loadShadowRecordForSession(input: {
  caseId: string;
  studyRunId: string;
  audience: CanonicalStudyReportAudience;
}): Promise<{
  artifact: Awaited<ReturnType<typeof loadDeterministicCanonicalStudyArtifactForSession>>;
  projection: ReturnType<typeof projectCanonicalStudyReport>;
  record: HiveWriterShadowRecord | null;
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
  const persistence = createShadowPersistence({
    userId,
    studyRunId: input.studyRunId,
    audience: input.audience,
    gateway,
  });
  const record = await persistence.load(idempotencyKey);
  return { artifact, projection, record };
}

export type WriterHiveUiTreePreviewPayload = WriterHiveUiPreviewResolution;

/** Read-only: loads persisted shadow record and re-validates; never invokes the Writer model. */
export async function loadWriterHiveUiTreePreviewForSession(input: {
  caseId: string;
  studyRunId: string;
  audience: CanonicalStudyReportAudience;
}): Promise<WriterHiveUiTreePreviewPayload> {
  const { artifact, projection, record } = await loadShadowRecordForSession(input);
  return resolveWriterHiveUiTreeForPreview({
    artifact,
    projection,
    record,
  });
}
