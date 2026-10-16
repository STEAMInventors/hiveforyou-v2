import { resolveCanonicalStudyReportPresentationMode } from "@hiveforyou/shared/canonical-study-report-projection";
import type { CanonicalStudyReportAudience } from "@hiveforyou/shared/canonical-study-report-projection";
import type { CanonicalStudyArtifact } from "@hiveforyou/shared/canonical-study-artifact";
import {
  hiveWriterShadowAttemptHistoryPath,
  hiveWriterShadowRecordPath,
} from "@hiveforyou/shared/hive-artifact-paths";
import {
  parseHiveWriterShadowRecord,
  type HiveWriterShadowRecord,
} from "@hiveforyou/shared/hive-writer-proposal";

import { CanonicalStudyArtifactsNotFoundError } from "../../study/run-deterministic-canonical-study.js";
import { assertWriterShadowOwner } from "./assert-writer-shadow-owner.js";
import { assertHiveWriterLoopbackHost, createWriterHttpClient } from "./create-writer-http-client.js";
import type { HiveWriterHttpClient } from "./create-writer-http-client.js";
import { buildHiveWriterShadowIdempotencyKey } from "./hive-writer-idempotency.js";
import {
  isHiveWriterShadowTerminalStatus,
  planWriterShadowPreviewRequest,
  planWriterShadowWorkerExecution,
} from "./plan-writer-shadow-dispatch.js";
import { projectCanonicalStudyReport } from "../project-canonical-study-report.js";
import { buildHiveWriterShadowMarkerRecord } from "./run-hive-writer-shadow.js";
import { runHiveWriterShadow } from "./run-hive-writer-shadow.js";
import type { HiveWriterShadowPersistence } from "./run-hive-writer-shadow.js";
import { resolveHiveWriterDomainBindingForPersistedStudy } from "./resolve-hive-writer-domain-binding.js";
import {
  appendTerminalAttemptSnapshot,
  canRetryTerminalWriterShadowFailure,
  isRetriableTerminalWriterShadowFailure,
  type HiveWriterShadowAttemptHistory,
} from "./writer-shadow-retry.js";

const DOCUMENT_PAGES_BUCKET = "document-pages";

export type WriterShadowRequestedDispatch = (input: {
  userId: string;
  caseId: string;
  studyRunId: string;
  audience: CanonicalStudyReportAudience;
  idempotencyKey: string;
}) => Promise<void>;

export type WriterShadowStorageUploadOptions = {
  /** When true, replace an existing object at the same path (non-terminal shadow transitions). */
  upsert?: boolean;
};

export type WriterShadowObjectGateway = {
  selectWhere(
    table: string,
    where: Record<string, string | number>,
    options?: { limit?: number },
  ): Promise<Array<Record<string, unknown>>>;
  downloadObject(bucket: string, path: string): Promise<Uint8Array>;
  uploadObject(
    bucket: string,
    path: string,
    bytes: Uint8Array,
    contentType?: string,
    options?: WriterShadowStorageUploadOptions,
  ): Promise<void>;
};

function textField(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value : "";
}

async function loadWriterShadowAttemptHistory(input: {
  gateway: WriterShadowObjectGateway;
  userId: string;
  studyRunId: string;
  audience: CanonicalStudyReportAudience;
  idempotencyKey: string;
}): Promise<HiveWriterShadowAttemptHistory | null> {
  const path = hiveWriterShadowAttemptHistoryPath(
    input.userId,
    input.studyRunId,
    input.audience,
    input.idempotencyKey,
  );
  try {
    const bytes = await input.gateway.downloadObject(DOCUMENT_PAGES_BUCKET, path);
    return JSON.parse(new TextDecoder().decode(bytes)) as HiveWriterShadowAttemptHistory;
  } catch {
    return null;
  }
}

async function saveWriterShadowAttemptHistory(input: {
  gateway: WriterShadowObjectGateway;
  userId: string;
  studyRunId: string;
  audience: CanonicalStudyReportAudience;
  idempotencyKey: string;
  history: HiveWriterShadowAttemptHistory;
}): Promise<void> {
  const path = hiveWriterShadowAttemptHistoryPath(
    input.userId,
    input.studyRunId,
    input.audience,
    input.idempotencyKey,
  );
  const bytes = new TextEncoder().encode(JSON.stringify(input.history));
  await input.gateway.uploadObject(DOCUMENT_PAGES_BUCKET, path, bytes, "application/json", {
    upsert: true,
  });
}

function createShadowPersistence(input: {
  gateway: WriterShadowObjectGateway;
  userId: string;
  studyRunId: string;
  audience: CanonicalStudyReportAudience;
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
        const bytes = await input.gateway.downloadObject(DOCUMENT_PAGES_BUCKET, path);
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
        const existingBytes = await input.gateway.downloadObject(DOCUMENT_PAGES_BUCKET, path);
        const existing = parseHiveWriterShadowRecord(
          JSON.parse(new TextDecoder().decode(existingBytes)),
        );
        if (isHiveWriterShadowTerminalStatus(existing.status)) {
          if (existing.status === "failed") {
            const attemptHistory = await loadWriterShadowAttemptHistory({
              gateway: input.gateway,
              userId: input.userId,
              studyRunId: input.studyRunId,
              audience: record.audience,
              idempotencyKey: record.idempotencyKey,
            });
            if (
              attemptHistory &&
              attemptHistory.attempts.length >= 1 &&
              isRetriableTerminalWriterShadowFailure(existing)
            ) {
              // Prior terminal failure archived — allow one replacement write.
            } else {
              return;
            }
          } else {
            return;
          }
        }
      } catch {
        // Missing object — first write for this idempotency key.
      }
      const bytes = new TextEncoder().encode(JSON.stringify(record));
      await input.gateway.uploadObject(DOCUMENT_PAGES_BUCKET, path, bytes, "application/json", {
        upsert: true,
      });
    },
  };
}

async function saveUnlessTerminal(
  persistence: HiveWriterShadowPersistence,
  record: HiveWriterShadowRecord,
): Promise<HiveWriterShadowRecord> {
  const existing = await persistence.load(record.idempotencyKey);
  if (existing && isHiveWriterShadowTerminalStatus(existing.status)) {
    return existing;
  }
  await persistence.save(record);
  return record;
}

function readPublication(artifact: CanonicalStudyArtifact): {
  customerProReportsPermitted: boolean;
  packApprovalLabel: string;
} {
  const metadata = artifact as CanonicalStudyArtifact & {
    customerProReportsPermitted?: unknown;
    packApprovalLabel?: unknown;
  };
  return {
    customerProReportsPermitted: metadata.customerProReportsPermitted === true,
    packApprovalLabel:
      typeof metadata.packApprovalLabel === "string" ? metadata.packApprovalLabel : "",
  };
}

/** Preview/Vercel path: queue persistence + Inngest dispatch only — never invokes hive-agents Writer HTTP. */
export async function enqueueHiveWriterShadowPreviewRequest(input: {
  claimedUserId: string;
  caseId: string;
  studyRunId: string;
  audience: CanonicalStudyReportAudience;
  env: Record<string, string | undefined>;
  gateway: WriterShadowObjectGateway;
  loadArtifact: (userId: string) => Promise<CanonicalStudyArtifact>;
  dispatchRequested: WriterShadowRequestedDispatch;
}): Promise<HiveWriterShadowRecord> {
  const studies = await input.gateway.selectWhere(
    "study_runs",
    { id: input.studyRunId },
    { limit: 1 },
  );
  const cases = await input.gateway.selectWhere("cases", { id: input.caseId }, { limit: 1 });
  const studyRow = studies[0];
  const caseRow = cases[0];
  const owner = assertWriterShadowOwner({
    claimedUserId: input.claimedUserId,
    caseId: input.caseId,
    persistedStudy: studyRow
      ? { userId: textField(studyRow, "user_id"), caseId: textField(studyRow, "case_id") }
      : null,
    persistedCase: caseRow ? { userId: textField(caseRow, "user_id") } : null,
  });

  const artifact = await input.loadArtifact(owner.userId);
  if (artifact.caseId !== input.caseId || artifact.studyRunId !== input.studyRunId) {
    throw new CanonicalStudyArtifactsNotFoundError();
  }

  const publication = readPublication(artifact);
  const presentationMode = resolveCanonicalStudyReportPresentationMode(publication);
  const projection = projectCanonicalStudyReport({
    artifact,
    audience: input.audience,
    customerProReportsPermitted: publication.customerProReportsPermitted,
    packApprovalLabel: publication.packApprovalLabel,
  });
  const domainBinding = resolveHiveWriterDomainBindingForPersistedStudy({
    studyRunId: input.studyRunId,
    audience: input.audience,
    artifact,
    projection,
  });
  const idempotencyKey = buildHiveWriterShadowIdempotencyKey({
    caseId: projection.caseId,
    studyRunId: projection.studyRunId,
    audience: projection.audience,
    packContentSha256: domainBinding.packContentSha256,
    reportProjectionContentSha256: domainBinding.reportProjectionContentSha256,
  });
  const persistence = createShadowPersistence({
    gateway: input.gateway,
    userId: owner.userId,
    studyRunId: input.studyRunId,
    audience: input.audience,
  });
  const existing = await persistence.load(idempotencyKey);
  const attemptHistory = await loadWriterShadowAttemptHistory({
    gateway: input.gateway,
    userId: owner.userId,
    studyRunId: input.studyRunId,
    audience: input.audience,
    idempotencyKey,
  });
  const allowTerminalFailedRetry =
    existing !== null &&
    canRetryTerminalWriterShadowFailure({ record: existing, attemptHistory });
  const plan = planWriterShadowPreviewRequest({
    presentationMode,
    existingStatus: existing?.status ?? null,
    allowTerminalFailedRetry,
  });

  const dispatchPayload = {
    userId: owner.userId,
    caseId: input.caseId,
    studyRunId: input.studyRunId,
    audience: input.audience,
    idempotencyKey,
  };

  if (plan.action === "return_existing" && existing) {
    if (plan.resend) {
      await input.dispatchRequested(dispatchPayload);
    }
    return existing;
  }

  if (plan.action === "block_publication") {
    return saveUnlessTerminal(
      persistence,
      buildHiveWriterShadowMarkerRecord({
        status: "failed",
        idempotencyKey,
        projection,
        projectionHash: domainBinding.reportProjectionContentSha256,
        errorCodes: ["WRITER_SHADOW_PUBLICATION_BLOCKED"],
        message: "Writer shadow is limited to internal preview.",
      }),
    );
  }

  if (allowTerminalFailedRetry && existing) {
    const archived = appendTerminalAttemptSnapshot({ history: attemptHistory, record: existing });
    await saveWriterShadowAttemptHistory({
      gateway: input.gateway,
      userId: owner.userId,
      studyRunId: input.studyRunId,
      audience: input.audience,
      idempotencyKey,
      history: archived,
    });
  }

  const queuedMarker = buildHiveWriterShadowMarkerRecord({
    status: "queued",
    idempotencyKey,
    projection,
    projectionHash: domainBinding.reportProjectionContentSha256,
    errorCodes: ["QUEUED"],
    message: null,
  });
  if (allowTerminalFailedRetry && existing) {
    await persistence.save(queuedMarker);
    await input.dispatchRequested(dispatchPayload);
    return queuedMarker;
  }

  const queued = await saveUnlessTerminal(persistence, queuedMarker);
  await input.dispatchRequested(dispatchPayload);
  return queued;
}

export async function executeHiveWriterShadowRequest(input: {
  claimedUserId: string;
  caseId: string;
  studyRunId: string;
  audience: CanonicalStudyReportAudience;
  env: Record<string, string | undefined>;
  gateway: WriterShadowObjectGateway;
  loadArtifact: (userId: string) => Promise<CanonicalStudyArtifact>;
  invokeWriter?: HiveWriterHttpClient;
}): Promise<HiveWriterShadowRecord> {
  const studies = await input.gateway.selectWhere(
    "study_runs",
    { id: input.studyRunId },
    { limit: 1 },
  );
  const cases = await input.gateway.selectWhere("cases", { id: input.caseId }, { limit: 1 });
  const studyRow = studies[0];
  const caseRow = cases[0];
  const owner = assertWriterShadowOwner({
    claimedUserId: input.claimedUserId,
    caseId: input.caseId,
    persistedStudy: studyRow
      ? { userId: textField(studyRow, "user_id"), caseId: textField(studyRow, "case_id") }
      : null,
    persistedCase: caseRow ? { userId: textField(caseRow, "user_id") } : null,
  });

  const artifact = await input.loadArtifact(owner.userId);
  if (artifact.caseId !== input.caseId || artifact.studyRunId !== input.studyRunId) {
    throw new CanonicalStudyArtifactsNotFoundError();
  }

  const publication = readPublication(artifact);
  const presentationMode = resolveCanonicalStudyReportPresentationMode(publication);
  const projection = projectCanonicalStudyReport({
    artifact,
    audience: input.audience,
    customerProReportsPermitted: publication.customerProReportsPermitted,
    packApprovalLabel: publication.packApprovalLabel,
  });
  const domainBinding = resolveHiveWriterDomainBindingForPersistedStudy({
    studyRunId: input.studyRunId,
    audience: input.audience,
    artifact,
    projection,
  });
  const idempotencyKey = buildHiveWriterShadowIdempotencyKey({
    caseId: projection.caseId,
    studyRunId: projection.studyRunId,
    audience: projection.audience,
    packContentSha256: domainBinding.packContentSha256,
    reportProjectionContentSha256: domainBinding.reportProjectionContentSha256,
  });
  const persistence = createShadowPersistence({
    gateway: input.gateway,
    userId: owner.userId,
    studyRunId: input.studyRunId,
    audience: input.audience,
  });
  const existing = await persistence.load(idempotencyKey);
  const attemptHistory = await loadWriterShadowAttemptHistory({
    gateway: input.gateway,
    userId: owner.userId,
    studyRunId: input.studyRunId,
    audience: input.audience,
    idempotencyKey,
  });
  const allowTerminalFailedRetry =
    existing !== null &&
    canRetryTerminalWriterShadowFailure({ record: existing, attemptHistory });
  const plan = planWriterShadowWorkerExecution({
    presentationMode,
    existingStatus: existing?.status ?? null,
    allowTerminalFailedRetry,
  });

  if (plan === "reuse" && existing) {
    return existing;
  }
  if (plan === "block_publication") {
    return saveUnlessTerminal(
      persistence,
      buildHiveWriterShadowMarkerRecord({
        status: "failed",
        idempotencyKey,
        projection,
        projectionHash: domainBinding.reportProjectionContentSha256,
        errorCodes: ["WRITER_SHADOW_PUBLICATION_BLOCKED"],
        message: "Writer shadow is limited to internal preview.",
      }),
    );
  }

  assertHiveWriterLoopbackHost(input.env);
  const invokeWriter = input.invokeWriter ?? createWriterHttpClient(input.env);
  if (allowTerminalFailedRetry && existing) {
    const archived = appendTerminalAttemptSnapshot({ history: attemptHistory, record: existing });
    await saveWriterShadowAttemptHistory({
      gateway: input.gateway,
      userId: owner.userId,
      studyRunId: input.studyRunId,
      audience: input.audience,
      idempotencyKey,
      history: archived,
    });
  }
  await saveUnlessTerminal(
    persistence,
    buildHiveWriterShadowMarkerRecord({
      status: "processing",
      idempotencyKey,
      projection,
      projectionHash: domainBinding.reportProjectionContentSha256,
      errorCodes: ["PROCESSING"],
      message: null,
    }),
  );
  return runHiveWriterShadow({
    artifact,
    projection,
    invokeWriter,
    persistence,
  });
}
