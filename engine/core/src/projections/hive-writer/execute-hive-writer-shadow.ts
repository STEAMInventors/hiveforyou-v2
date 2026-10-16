import { resolveCanonicalStudyReportPresentationMode } from "@hiveforyou/shared/canonical-study-report-projection";
import type { CanonicalStudyReportAudience } from "@hiveforyou/shared/canonical-study-report-projection";
import type { CanonicalStudyArtifact } from "@hiveforyou/shared/canonical-study-artifact";
import { hiveWriterShadowRecordPath } from "@hiveforyou/shared/hive-artifact-paths";
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

const DOCUMENT_PAGES_BUCKET = "document-pages";

export type WriterShadowRequestedDispatch = (input: {
  userId: string;
  caseId: string;
  studyRunId: string;
  audience: CanonicalStudyReportAudience;
  idempotencyKey: string;
}) => Promise<void>;

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
  ): Promise<void>;
};

function textField(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value : "";
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
      const bytes = new TextEncoder().encode(JSON.stringify(record));
      await input.gateway.uploadObject(DOCUMENT_PAGES_BUCKET, path, bytes, "application/json");
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
  const plan = planWriterShadowPreviewRequest({
    vercelEnv: input.env.VERCEL_ENV,
    presentationMode,
    existingStatus: existing?.status ?? null,
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

  if (plan.action === "skip_disabled") {
    return saveUnlessTerminal(
      persistence,
      buildHiveWriterShadowMarkerRecord({
        status: "skipped",
        idempotencyKey,
        projection,
        projectionHash: domainBinding.reportProjectionContentSha256,
        errorCodes: ["SHADOW_DISABLED"],
        message: "Shadow mode disabled.",
      }),
    );
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

  const queued = await saveUnlessTerminal(
    persistence,
    buildHiveWriterShadowMarkerRecord({
      status: "queued",
      idempotencyKey,
      projection,
      projectionHash: domainBinding.reportProjectionContentSha256,
      errorCodes: ["QUEUED"],
      message: null,
    }),
  );
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
  const plan = planWriterShadowWorkerExecution({
    presentationMode,
    existingStatus: existing?.status ?? null,
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
