import { randomUUID } from "node:crypto";

import { resolveCanonicalStudyReportPresentationMode } from "@hiveforyou/shared/canonical-study-report-projection";
import type { CanonicalStudyReportAudience } from "@hiveforyou/shared/canonical-study-report-projection";
import type { CanonicalStudyArtifact } from "@hiveforyou/shared/canonical-study-artifact";
import {
  hiveWriterShadowLatestAcceptedPath,
  hiveWriterShadowLegacyBindingRecordPath,
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
  shouldBlockWriterShadowPublication,
  shouldInvokeWriterRun,
  shouldReuseWriterRunRecord,
} from "./plan-writer-shadow-dispatch.js";
import { projectCanonicalStudyReport } from "../project-canonical-study-report.js";
import {
  buildHiveWriterShadowMarkerRecord,
  runHiveWriterShadow,
  type HiveWriterShadowPersistence,
} from "./run-hive-writer-shadow.js";
import { resolveHiveWriterDomainBindingForPersistedStudy } from "./resolve-hive-writer-domain-binding.js";

const DOCUMENT_PAGES_BUCKET = "document-pages";

export type WriterShadowRequestedDispatch = (input: {
  userId: string;
  caseId: string;
  studyRunId: string;
  audience: CanonicalStudyReportAudience;
  writerRunId: string;
}) => Promise<void>;

export type WriterShadowStorageUploadOptions = {
  upsert?: boolean;
};

export function createWriterRunId(createId?: () => string): string {
  return createId?.() ?? randomUUID();
}

export const HIVE_WRITER_SHADOW_LATEST_ACCEPTED_SCHEMA_VERSION =
  "hive-writer-shadow-latest-accepted/1" as const;

export type HiveWriterShadowLatestAcceptedPointer = {
  schemaVersion: typeof HIVE_WRITER_SHADOW_LATEST_ACCEPTED_SCHEMA_VERSION;
  writerRunId: string;
  idempotencyKey: string;
  updatedAt: string;
};

export type WriterShadowObjectReader = {
  downloadObject(bucket: string, path: string): Promise<Uint8Array>;
};

export type WriterShadowObjectWriter = WriterShadowObjectReader & {
  uploadObject(
    bucket: string,
    path: string,
    bytes: Uint8Array,
    contentType?: string,
    options?: WriterShadowStorageUploadOptions,
  ): Promise<void>;
};

function parseLatestAcceptedPointer(value: unknown): HiveWriterShadowLatestAcceptedPointer | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Record<string, unknown>;
  if (row.schemaVersion !== HIVE_WRITER_SHADOW_LATEST_ACCEPTED_SCHEMA_VERSION) {
    return null;
  }
  if (typeof row.writerRunId !== "string" || typeof row.idempotencyKey !== "string") {
    return null;
  }
  if (row.idempotencyKey.length !== 64 || typeof row.updatedAt !== "string") {
    return null;
  }
  return {
    schemaVersion: HIVE_WRITER_SHADOW_LATEST_ACCEPTED_SCHEMA_VERSION,
    writerRunId: row.writerRunId,
    idempotencyKey: row.idempotencyKey,
    updatedAt: row.updatedAt,
  };
}

export function createWriterRunPersistence(input: {
  gateway: WriterShadowObjectWriter;
  bucket: string;
  userId: string;
  studyRunId: string;
  audience: HiveWriterShadowRecord["audience"];
}): HiveWriterShadowPersistence {
  return {
    load: async (writerRunId) => {
      const path = hiveWriterShadowRecordPath(
        input.userId,
        input.studyRunId,
        input.audience,
        writerRunId,
      );
      try {
        const bytes = await input.gateway.downloadObject(input.bucket, path);
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
        record.writerRunId,
      );
      try {
        const existingBytes = await input.gateway.downloadObject(input.bucket, path);
        const existing = parseHiveWriterShadowRecord(
          JSON.parse(new TextDecoder().decode(existingBytes)),
        );
        if (isHiveWriterShadowTerminalStatus(existing.status)) {
          return;
        }
      } catch {
        // First write for this writer run.
      }
      const bytes = new TextEncoder().encode(JSON.stringify(record));
      await input.gateway.uploadObject(input.bucket, path, bytes, "application/json", {
        upsert: true,
      });
    },
  };
}

export async function loadWriterShadowRecordByRunId(input: {
  gateway: WriterShadowObjectReader;
  bucket: string;
  userId: string;
  studyRunId: string;
  audience: HiveWriterShadowRecord["audience"];
  writerRunId: string;
}): Promise<HiveWriterShadowRecord | null> {
  const persistence = createWriterRunPersistence({
    gateway: input.gateway as WriterShadowObjectWriter,
    bucket: input.bucket,
    userId: input.userId,
    studyRunId: input.studyRunId,
    audience: input.audience,
  });
  return persistence.load(input.writerRunId);
}

export async function loadLegacyBindingWriterShadowRecord(input: {
  gateway: WriterShadowObjectReader;
  bucket: string;
  userId: string;
  studyRunId: string;
  audience: HiveWriterShadowRecord["audience"];
  projectionBindingKey: string;
}): Promise<HiveWriterShadowRecord | null> {
  const path = hiveWriterShadowLegacyBindingRecordPath(
    input.userId,
    input.studyRunId,
    input.audience,
    input.projectionBindingKey,
  );
  try {
    const bytes = await input.gateway.downloadObject(input.bucket, path);
    return parseHiveWriterShadowRecord(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}

export async function loadLatestAcceptedWriterShadowRecord(input: {
  gateway: WriterShadowObjectReader;
  bucket: string;
  userId: string;
  studyRunId: string;
  audience: HiveWriterShadowRecord["audience"];
  projectionBindingKey: string;
}): Promise<HiveWriterShadowRecord | null> {
  const pointerPath = hiveWriterShadowLatestAcceptedPath(
    input.userId,
    input.studyRunId,
    input.audience,
  );
  try {
    const bytes = await input.gateway.downloadObject(input.bucket, pointerPath);
    const pointer = parseLatestAcceptedPointer(JSON.parse(new TextDecoder().decode(bytes)));
    if (!pointer || pointer.idempotencyKey !== input.projectionBindingKey) {
      return null;
    }
    const record = await loadWriterShadowRecordByRunId({
      gateway: input.gateway,
      bucket: input.bucket,
      userId: input.userId,
      studyRunId: input.studyRunId,
      audience: input.audience,
      writerRunId: pointer.writerRunId,
    });
    if (record?.status === "accepted") {
      return record;
    }
  } catch {
    // No pointer or stale pointer — fall through to legacy path.
  }

  const legacy = await loadLegacyBindingWriterShadowRecord({
    gateway: input.gateway,
    bucket: input.bucket,
    userId: input.userId,
    studyRunId: input.studyRunId,
    audience: input.audience,
    projectionBindingKey: input.projectionBindingKey,
  });
  if (legacy?.status === "accepted") {
    return legacy;
  }
  return null;
}

export async function persistLatestAcceptedWriterShadowPointer(input: {
  gateway: WriterShadowObjectWriter;
  bucket: string;
  userId: string;
  record: HiveWriterShadowRecord;
  now?: () => number;
}): Promise<void> {
  if (input.record.status !== "accepted") {
    return;
  }
  const pointer: HiveWriterShadowLatestAcceptedPointer = {
    schemaVersion: HIVE_WRITER_SHADOW_LATEST_ACCEPTED_SCHEMA_VERSION,
    writerRunId: input.record.writerRunId,
    idempotencyKey: input.record.idempotencyKey,
    updatedAt: new Date((input.now ?? (() => Date.now()))()).toISOString(),
  };
  const path = hiveWriterShadowLatestAcceptedPath(
    input.userId,
    input.record.studyRunId,
    input.record.audience,
  );
  const bytes = new TextEncoder().encode(JSON.stringify(pointer));
  await input.gateway.uploadObject(input.bucket, path, bytes, "application/json", {
    upsert: true,
  });
}

export type WriterShadowObjectGateway = WriterShadowObjectWriter & {
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

async function resolveWriterShadowContext(input: {
  claimedUserId: string;
  caseId: string;
  studyRunId: string;
  audience: CanonicalStudyReportAudience;
  gateway: WriterShadowObjectGateway;
  loadArtifact: (userId: string) => Promise<CanonicalStudyArtifact>;
}) {
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

  return {
    owner,
    artifact,
    presentationMode,
    projection,
    domainBinding,
    idempotencyKey,
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
  createWriterRunId?: () => string;
}): Promise<HiveWriterShadowRecord> {
  const ctx = await resolveWriterShadowContext(input);
  const writerRunId = createWriterRunId(input.createWriterRunId);
  const persistence = createWriterRunPersistence({
    gateway: input.gateway,
    bucket: DOCUMENT_PAGES_BUCKET,
    userId: ctx.owner.userId,
    studyRunId: input.studyRunId,
    audience: input.audience,
  });

  if (shouldBlockWriterShadowPublication(ctx.presentationMode)) {
    const blocked = buildHiveWriterShadowMarkerRecord({
      writerRunId,
      status: "failed",
      idempotencyKey: ctx.idempotencyKey,
      projection: ctx.projection,
      projectionHash: ctx.domainBinding.reportProjectionContentSha256,
      errorCodes: ["WRITER_SHADOW_PUBLICATION_BLOCKED"],
      message: "Writer shadow is limited to internal preview.",
    });
    await persistence.save(blocked);
    return blocked;
  }

  const queued = buildHiveWriterShadowMarkerRecord({
    writerRunId,
    status: "queued",
    idempotencyKey: ctx.idempotencyKey,
    projection: ctx.projection,
    projectionHash: ctx.domainBinding.reportProjectionContentSha256,
    errorCodes: ["QUEUED"],
    message: null,
  });
  await persistence.save(queued);
  await input.dispatchRequested({
    userId: ctx.owner.userId,
    caseId: input.caseId,
    studyRunId: input.studyRunId,
    audience: input.audience,
    writerRunId,
  });
  return queued;
}

export async function executeHiveWriterShadowRequest(input: {
  claimedUserId: string;
  caseId: string;
  studyRunId: string;
  audience: CanonicalStudyReportAudience;
  writerRunId: string;
  env: Record<string, string | undefined>;
  gateway: WriterShadowObjectGateway;
  loadArtifact: (userId: string) => Promise<CanonicalStudyArtifact>;
  invokeWriter?: HiveWriterHttpClient;
}): Promise<HiveWriterShadowRecord> {
  const ctx = await resolveWriterShadowContext(input);
  const persistence = createWriterRunPersistence({
    gateway: input.gateway,
    bucket: DOCUMENT_PAGES_BUCKET,
    userId: ctx.owner.userId,
    studyRunId: input.studyRunId,
    audience: input.audience,
  });

  const existing = await loadWriterShadowRecordByRunId({
    gateway: input.gateway,
    bucket: DOCUMENT_PAGES_BUCKET,
    userId: ctx.owner.userId,
    studyRunId: input.studyRunId,
    audience: input.audience,
    writerRunId: input.writerRunId,
  });

  if (!existing) {
    const missing = buildHiveWriterShadowMarkerRecord({
      writerRunId: input.writerRunId,
      status: "failed",
      idempotencyKey: ctx.idempotencyKey,
      projection: ctx.projection,
      projectionHash: ctx.domainBinding.reportProjectionContentSha256,
      errorCodes: ["WRITER_RUN_NOT_FOUND"],
      message: "Writer run record was not found.",
    });
    await persistence.save(missing);
    return missing;
  }

  if (shouldReuseWriterRunRecord(existing.status)) {
    return existing;
  }

  if (shouldBlockWriterShadowPublication(ctx.presentationMode)) {
    const blocked = buildHiveWriterShadowMarkerRecord({
      writerRunId: input.writerRunId,
      status: "failed",
      idempotencyKey: ctx.idempotencyKey,
      projection: ctx.projection,
      projectionHash: ctx.domainBinding.reportProjectionContentSha256,
      errorCodes: ["WRITER_SHADOW_PUBLICATION_BLOCKED"],
      message: "Writer shadow is limited to internal preview.",
    });
    await persistence.save(blocked);
    return blocked;
  }

  if (!shouldInvokeWriterRun(existing.status)) {
    return existing;
  }

  assertHiveWriterLoopbackHost(input.env);
  const invokeWriter = input.invokeWriter ?? createWriterHttpClient(input.env);

  await persistence.save(
    buildHiveWriterShadowMarkerRecord({
      writerRunId: input.writerRunId,
      status: "processing",
      idempotencyKey: ctx.idempotencyKey,
      projection: ctx.projection,
      projectionHash: ctx.domainBinding.reportProjectionContentSha256,
      errorCodes: ["PROCESSING"],
      message: null,
    }),
  );

  const record = await runHiveWriterShadow({
    writerRunId: input.writerRunId,
    artifact: ctx.artifact,
    projection: ctx.projection,
    invokeWriter,
    persistence,
  });

  if (record.status === "accepted") {
    await persistLatestAcceptedWriterShadowPointer({
      gateway: input.gateway,
      bucket: DOCUMENT_PAGES_BUCKET,
      userId: ctx.owner.userId,
      record,
    });
  }

  return record;
}
