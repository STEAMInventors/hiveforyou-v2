import "server-only";

import {
  buildHiveWriterShadowIdempotencyKey,
  buildHiveWriterShadowMarkerRecord,
  isHiveWriterShadowInFlightStatus,
  isHiveWriterShadowTerminalStatus,
  planWriterShadowPreviewRequest,
  projectCanonicalStudyReport,
  readHiveWriterShadowModeEnabled,
  resolveHiveWriterDomainBinding,
  resolveWriterHiveUiTreeForPreview,
  type HiveWriterShadowPersistence,
  type WriterHiveUiPreviewResolution,
} from "@hiveforyou/core";
import type { CanonicalStudyDebugArtifactMetadata } from "@hiveforyou/core";
import { resolveCanonicalStudyReportPresentationMode } from "@hiveforyou/shared/canonical-study-report-projection";
import type { CanonicalStudyReportAudience } from "@hiveforyou/shared/canonical-study-report-projection";
import {
  buildHiveWriterShadowRequestedEventId,
  HIVE_EVENT_WRITER_SHADOW_REQUESTED,
  hiveWriterShadowRequestedEventDataSchema,
} from "@hiveforyou/shared/events";
import { hiveWriterShadowRecordPath } from "@hiveforyou/shared/hive-artifact-paths";
import {
  parseHiveWriterShadowRecord,
  type HiveWriterShadowRecord,
} from "@hiveforyou/shared/hive-writer-proposal";

import { loadDeterministicCanonicalStudyArtifactForSession } from "@/lib/canonical-debug/run-deterministic-canonical-study-server";
import { inngest } from "@/lib/inngest/client";
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
  const persistence: HiveWriterShadowPersistence = {
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
      if (record.status === "queued") {
        const existing = await persistence.load(record.idempotencyKey);
        if (existing && existing.status !== "skipped") {
          return;
        }
      }
      const path = hiveWriterShadowRecordPath(
        input.userId,
        input.studyRunId,
        record.audience,
        record.idempotencyKey,
      );
      const bytes = new TextEncoder().encode(JSON.stringify(record));
      await input.gateway.uploadObject(STORAGE_BUCKET, path, bytes, "application/json");
    },
  };
  return persistence;
}

function toDiagnostic(record: HiveWriterShadowRecord): HiveWriterShadowDiagnostic {
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

function disabledDiagnostic(): HiveWriterShadowDiagnostic {
  return {
    status: "skipped",
    idempotencyKey: "",
    validation: { ok: false, errorCodes: ["SHADOW_DISABLED"], message: "Shadow mode disabled." },
    observability: { durationMs: 0, modelIdentifier: null, projectionHash: "" },
  };
}

async function sendWriterShadowEvent(input: {
  userId: string;
  caseId: string;
  studyRunId: string;
  audience: CanonicalStudyReportAudience;
  idempotencyKey: string;
}): Promise<void> {
  const data = hiveWriterShadowRequestedEventDataSchema.parse({
    userId: input.userId,
    caseId: input.caseId,
    studyRunId: input.studyRunId,
    audience: input.audience,
  });
  await inngest.send({
    id: buildHiveWriterShadowRequestedEventId({
      studyRunId: input.studyRunId,
      audience: input.audience,
      idempotencyKey: input.idempotencyKey,
    }),
    name: HIVE_EVENT_WRITER_SHADOW_REQUESTED,
    data,
  });
}

/** Enqueue a Writer shadow run. The Next.js process does not call hive-agents. */
export async function runHiveWriterShadowForSession(input: {
  caseId: string;
  studyRunId: string;
  audience: CanonicalStudyReportAudience;
}): Promise<HiveWriterShadowDiagnostic> {
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
  const presentationMode = resolveCanonicalStudyReportPresentationMode({
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
  const existing = await persistence.load(idempotencyKey);
  const decision = planWriterShadowPreviewRequest({
    shadowModeEnabled: readHiveWriterShadowModeEnabled(process.env),
    vercelEnv: process.env.VERCEL_ENV,
    presentationMode,
    existingStatus: existing?.status ?? null,
  });

  if (decision.action === "skip_disabled") {
    return disabledDiagnostic();
  }
  if (decision.action === "block_publication") {
    const blocked = buildHiveWriterShadowMarkerRecord({
      status: "failed",
      idempotencyKey,
      projection,
      projectionHash: domainBinding.reportProjectionContentSha256,
      errorCodes: ["WRITER_SHADOW_PUBLICATION_BLOCKED"],
      message: "Writer shadow is limited to internal preview.",
    });
    await persistence.save(blocked);
    return toDiagnostic(blocked);
  }
  if (decision.action === "return_existing" && existing) {
    if (decision.resend) {
      await sendWriterShadowEvent({
        userId,
        caseId: input.caseId,
        studyRunId: input.studyRunId,
        audience: input.audience,
        idempotencyKey,
      });
    }
    return toDiagnostic(existing);
  }

  const queued = buildHiveWriterShadowMarkerRecord({
    status: "queued",
    idempotencyKey,
    projection,
    projectionHash: domainBinding.reportProjectionContentSha256,
    errorCodes: ["QUEUED"],
    message: null,
  });
  await persistence.save(queued);
  await sendWriterShadowEvent({
    userId,
    caseId: input.caseId,
    studyRunId: input.studyRunId,
    audience: input.audience,
    idempotencyKey,
  });
  const current = await persistence.load(idempotencyKey);
  if (current && (isHiveWriterShadowTerminalStatus(current.status) || isHiveWriterShadowInFlightStatus(current.status))) {
    return toDiagnostic(current);
  }
  return toDiagnostic(queued);
}

export async function loadHiveWriterShadowDiagnosticForSession(input: {
  caseId: string;
  studyRunId: string;
  audience: CanonicalStudyReportAudience;
}): Promise<HiveWriterShadowDiagnostic | null> {
  if (!readHiveWriterShadowModeEnabled(process.env)) {
    return {
      status: "unavailable",
      idempotencyKey: "",
      validation: { ok: false, errorCodes: ["SHADOW_DISABLED"], message: null },
      observability: { durationMs: 0, modelIdentifier: null, projectionHash: "" },
    };
  }
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

export type WriterHiveUiTreePreviewPayload = WriterHiveUiPreviewResolution & {
  writerShadowEnabled: boolean;
};

/** Read-only: loads persisted shadow record and re-validates; never invokes the Writer model. */
export async function loadWriterHiveUiTreePreviewForSession(input: {
  caseId: string;
  studyRunId: string;
  audience: CanonicalStudyReportAudience;
}): Promise<WriterHiveUiTreePreviewPayload> {
  const writerShadowEnabled = readHiveWriterShadowModeEnabled(process.env);
  const { artifact, projection, record } = await loadShadowRecordForSession(input);
  const resolution = resolveWriterHiveUiTreeForPreview({
    artifact,
    projection,
    record,
    shadowModeEnabled: writerShadowEnabled,
  });
  return { ...resolution, writerShadowEnabled };
}
