import { randomUUID } from "node:crypto";

import type {
  CaseIntelligenceRepository,
  PersistedCaseIntelligence,
} from "@hiveforyou/canonical";
import {
  buildSourceDocumentStoragePath,
  canAccessStorageObject,
  CaseIdConflictError,
  hashCanonicalJson,
  withSessionOwner,
  type CaseRecord,
  type CaseRepository,
  type SourceDocumentRecord,
  type SourceDocumentRepository,
  type SourceDocumentStorage,
  type StorageLocator,
  type StudyContextRepository,
  type StudyRunEventRepository,
  type StudyRunRepository,
  type UploadSourceDocumentInput,
} from "@hiveforyou/core";
import type { CanonicalStudyContext, CanonicalStudyRun, StudyRunEvent } from "@hiveforyou/shared/canonical-study";
import type { QuestionsAnswerSnapshot } from "@hiveforyou/shared/questions";
import type { HiveGateway, HiveRow } from "./hive-gateway";

function text(row: HiveRow, key: string): string {
  const value = row[key];
  if (typeof value !== "string") {
    throw new Error(`Expected ${key} to be text.`);
  }
  return value;
}

function nullableText(row: HiveRow, key: string): string | null {
  const value = row[key];
  if (value == null) {
    return null;
  }
  return String(value);
}

export class SupabaseCaseRepository implements CaseRepository {
  constructor(
    private readonly gateway: HiveGateway,
    private readonly userId: string,
  ) {}

  async getById(userId: string, caseId: string): Promise<CaseRecord | null> {
    if (userId !== this.userId) {
      return null;
    }
    const rows = await this.gateway.selectWhere(
      "cases",
      { id: caseId, user_id: this.userId },
      { limit: 1 },
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      id: text(row, "id"),
      userId: text(row, "user_id"),
      domainId: nullableText(row, "domain_id"),
      createdAt: text(row, "created_at"),
      updatedAt: text(row, "updated_at"),
    };
  }

  async create(input: {
    id: string;
    userId: string;
    domainId: string | null;
  }): Promise<CaseRecord> {
    const now = new Date().toISOString();
    const row = withSessionOwner(this.userId, {
      id: input.id,
      user_id: input.userId,
      domain_id: input.domainId,
      created_at: now,
      updated_at: now,
    });
    try {
      await this.gateway.insert("cases", row);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/duplicate|unique|23505/i.test(message)) {
        throw new CaseIdConflictError();
      }
      throw error;
    }
    const created = await this.getById(this.userId, input.id);
    if (!created) {
      throw new Error("CASE_PERSISTENCE_FAILED");
    }
    return created;
  }

  async setDomain(userId: string, caseId: string, domainId: string): Promise<void> {
    if (userId !== this.userId) {
      return;
    }
    await this.gateway.updateWhere(
      "cases",
      { domain_id: domainId },
      { id: caseId, user_id: this.userId },
    );
  }
}

function mapSourceDocument(row: HiveRow): SourceDocumentRecord {
  return {
    id: text(row, "id"),
    userId: text(row, "user_id"),
    caseId: text(row, "case_id"),
    intakeRunId: nullableText(row, "intake_run_id"),
    studyRunId: nullableText(row, "study_run_id"),
    clientStagedId: nullableText(row, "client_staged_id"),
    originalFilename: text(row, "original_filename"),
    mimeType: nullableText(row, "mime_type"),
    sizeBytes: Number(row.size_bytes ?? 0),
    storageBucket: text(row, "storage_bucket"),
    storagePath: text(row, "storage_path"),
    sha256: text(row, "sha256"),
    status: "stored",
    createdAt: text(row, "created_at"),
    updatedAt: text(row, "updated_at"),
  };
}

export class SupabaseSourceDocumentRepository implements SourceDocumentRepository {
  constructor(
    private readonly gateway: HiveGateway,
    private readonly userId: string,
  ) {}

  async insert(record: SourceDocumentRecord): Promise<void> {
    await this.gateway.insert(
      "source_documents",
      withSessionOwner(this.userId, {
        id: record.id,
        user_id: record.userId,
        case_id: record.caseId,
        intake_run_id: record.intakeRunId,
        study_run_id: record.studyRunId,
        client_staged_id: record.clientStagedId,
        original_filename: record.originalFilename,
        mime_type: record.mimeType,
        size_bytes: record.sizeBytes,
        storage_bucket: record.storageBucket,
        storage_path: record.storagePath,
        sha256: record.sha256,
        status: record.status,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
      }),
    );
  }

  async getById(userId: string, id: string): Promise<SourceDocumentRecord | null> {
    if (userId !== this.userId) {
      return null;
    }
    const rows = await this.gateway.selectWhere(
      "source_documents",
      { id, user_id: this.userId },
      { limit: 1 },
    );
    return rows[0] ? mapSourceDocument(rows[0]) : null;
  }

  async findByClientStagedId(
    userId: string,
    caseId: string,
    clientStagedId: string,
  ): Promise<SourceDocumentRecord | null> {
    if (userId !== this.userId) {
      return null;
    }
    const rows = await this.gateway.selectWhere(
      "source_documents",
      {
        user_id: this.userId,
        case_id: caseId,
        client_staged_id: clientStagedId,
      },
      { limit: 1 },
    );
    return rows[0] ? mapSourceDocument(rows[0]) : null;
  }

  async listByCase(userId: string, caseId: string): Promise<SourceDocumentRecord[]> {
    if (userId !== this.userId) {
      return [];
    }
    const rows = await this.gateway.selectWhere("source_documents", {
      user_id: this.userId,
      case_id: caseId,
    });
    return rows.map(mapSourceDocument);
  }

  async attachStudyRun(userId: string, caseId: string, studyRunId: string): Promise<void> {
    if (userId !== this.userId) {
      return;
    }
    await this.gateway.updateWhere(
      "source_documents",
      { study_run_id: studyRunId },
      { user_id: this.userId, case_id: caseId },
    );
  }
}

export class SupabaseSourceDocumentStorage implements SourceDocumentStorage {
  constructor(
    private readonly gateway: HiveGateway,
    private readonly bucket: string,
    private readonly actorUserId: string,
  ) {}

  async upload(input: UploadSourceDocumentInput): Promise<StorageLocator> {
    if (input.userId !== this.actorUserId || input.bucket !== this.bucket) {
      throw new Error("STORAGE_FORBIDDEN");
    }
    const path = buildSourceDocumentStoragePath({
      userId: this.actorUserId,
      caseId: input.caseId,
      sourceDocumentId: input.sourceDocumentId,
      originalFilename: input.originalFilename,
    });
    await this.gateway.uploadObject(this.bucket, path, input.bytes, input.mimeType);
    return { bucket: this.bucket, path };
  }

  async get(locator: StorageLocator): Promise<Uint8Array> {
    if (locator.bucket !== this.bucket || !canAccessStorageObject(this.actorUserId, locator.path)) {
      throw new Error("STORAGE_FORBIDDEN");
    }
    return this.gateway.downloadObject(locator.bucket, locator.path);
  }

  async remove(locator: StorageLocator): Promise<void> {
    if (locator.bucket !== this.bucket || !canAccessStorageObject(this.actorUserId, locator.path)) {
      throw new Error("STORAGE_FORBIDDEN");
    }
    await this.gateway.removeObject(locator.bucket, locator.path);
  }
}

export type AnswerSnapshotRecord = {
  id: string;
  caseId: string;
  userId: string;
  questionSetId: string;
  snapshot: QuestionsAnswerSnapshot;
  snapshotHash: string;
  createdAt: string;
};

function isAnswerSnapshotConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("answer_snapshots_case_id_snapshot_hash_key")) {
    return true;
  }
  if (message.includes("23505") && message.toLowerCase().includes("answer_snapshots")) {
    return true;
  }
  return message.includes("23505") && message.toLowerCase().includes("snapshot_hash");
}

export class SupabaseAnswerSnapshotRepository {
  constructor(
    private readonly gateway: HiveGateway,
    private readonly userId: string,
  ) {}

  async getByCaseAndHash(caseId: string, snapshotHash: string): Promise<AnswerSnapshotRecord | null> {
    const rows = await this.gateway.selectWhere(
      "answer_snapshots",
      { case_id: caseId, snapshot_hash: snapshotHash },
      { limit: 1 },
    );
    return rows[0] ? mapAnswerSnapshot(rows[0]) : null;
  }

  async save(input: {
    caseId: string;
    questionSetId: string;
    snapshot: QuestionsAnswerSnapshot;
  }): Promise<AnswerSnapshotRecord> {
    const snapshotHash = hashCanonicalJson(input.snapshot);
    const existing = await this.getByCaseAndHash(input.caseId, snapshotHash);
    if (existing) {
      return existing;
    }
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    try {
      await this.gateway.insert(
        "answer_snapshots",
        withSessionOwner(this.userId, {
          id,
          case_id: input.caseId,
          user_id: this.userId,
          question_set_id: input.questionSetId,
          snapshot_json: input.snapshot,
          snapshot_hash: snapshotHash,
          created_at: createdAt,
        }),
      );
    } catch (error) {
      if (!isAnswerSnapshotConflict(error)) {
        throw error;
      }
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const winner = await this.getByCaseAndHash(input.caseId, snapshotHash);
        if (winner) {
          return winner;
        }
        await sleepMs(10 * (attempt + 1));
      }
      throw new Error("ANSWER_SNAPSHOT_PERSISTENCE_FAILED");
    }
    const loaded = (await this.getById(id)) ?? (await this.getByCaseAndHash(input.caseId, snapshotHash));
    if (!loaded) {
      throw new Error("ANSWER_SNAPSHOT_PERSISTENCE_FAILED");
    }
    return loaded;
  }

  async getById(id: string): Promise<AnswerSnapshotRecord | null> {
    const rows = await this.gateway.selectWhere(
      "answer_snapshots",
      { id, user_id: this.userId },
      { limit: 1 },
    );
    return rows[0] ? mapAnswerSnapshot(rows[0]) : null;
  }
}

function mapAnswerSnapshot(row: HiveRow): AnswerSnapshotRecord {
  return {
    id: text(row, "id"),
    caseId: text(row, "case_id"),
    userId: text(row, "user_id"),
    questionSetId: text(row, "question_set_id"),
    snapshot: row.snapshot_json as QuestionsAnswerSnapshot,
    snapshotHash: text(row, "snapshot_hash"),
    createdAt: text(row, "created_at"),
  };
}

function assertPromptAudit(run: CanonicalStudyRun): void {
  if (!run.promptId || !run.promptVersion || !run.promptSha256 || run.promptVersion === "latest") {
    throw new Error("PROMPT_AUDIT_REQUIRED");
  }
}

function runToRow(run: CanonicalStudyRun, userId: string): HiveRow {
  assertPromptAudit(run);
  return withSessionOwner(userId, {
    id: run.studyRunId,
    case_id: run.caseId,
    user_id: userId,
    idempotency_key: run.idempotencyKey,
    study_context_version: "canonical-study-context/1",
    study_context_id: run.studyContextId,
    domain_id: run.domainId,
    domain_pack_id: run.domainPackId,
    domain_pack_version: run.domainPackVersion,
    engine_provider: run.providerId,
    provider_mode: run.providerMode,
    prompt_id: run.promptId,
    prompt_version: run.promptVersion,
    prompt_sha256: run.promptSha256,
    question_set_version: run.questionSetVersion,
    answer_snapshot_hash: run.answerSnapshotHash,
    status: run.status,
    started_at: run.startedAt,
    completed_at: run.completedAt ?? null,
    error_code: run.errorCode ?? null,
    error_message_safe: run.errorMessage ?? null,
    validation_result_json: run.validationResult ?? null,
    case_intelligence_version: run.caseIntelligenceVersion ?? null,
    intake_run_id: run.intakeRunId ?? null,
    created_at: run.startedAt,
    updated_at: new Date().toISOString(),
  });
}

function mapRun(row: HiveRow): CanonicalStudyRun {
  return {
    studyRunId: text(row, "id"),
    caseId: text(row, "case_id"),
    intakeRunId: nullableText(row, "intake_run_id") ?? undefined,
    idempotencyKey: text(row, "idempotency_key"),
    studyContextId: text(row, "study_context_id"),
    domainId: text(row, "domain_id"),
    domainPackId: text(row, "domain_pack_id"),
    domainPackVersion: text(row, "domain_pack_version"),
    questionSetVersion: text(row, "question_set_version"),
    answerSnapshotHash: text(row, "answer_snapshot_hash"),
    providerId: text(row, "engine_provider"),
    providerMode: text(row, "provider_mode") as CanonicalStudyRun["providerMode"],
    promptId: text(row, "prompt_id"),
    promptVersion: text(row, "prompt_version"),
    promptSha256: text(row, "prompt_sha256"),
    startedAt: text(row, "started_at"),
    completedAt: nullableText(row, "completed_at") ?? undefined,
    status: text(row, "status") as CanonicalStudyRun["status"],
    errorCode: (nullableText(row, "error_code") ?? undefined) as CanonicalStudyRun["errorCode"],
    errorMessage: nullableText(row, "error_message_safe") ?? undefined,
    validationResult: (row.validation_result_json ?? undefined) as CanonicalStudyRun["validationResult"],
    caseIntelligenceVersion:
      row.case_intelligence_version == null
        ? undefined
        : Number(row.case_intelligence_version),
  };
}

function isStudyIdempotencyConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (message.includes("study_runs_case_id_idempotency_key_key")) {
    return true;
  }
  if (message.includes("23505")) {
    return true;
  }
  return lower.includes("duplicate key") && lower.includes("idempotency");
}

function persistedStudyRunFromLocated(
  run: CanonicalStudyRun,
  located: CanonicalStudyRun,
): CanonicalStudyRun {
  return {
    ...run,
    studyRunId: located.studyRunId,
    startedAt: located.startedAt,
  };
}

async function sleepMs(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export class SupabaseStudyRunRepository implements StudyRunRepository {
  constructor(
    private readonly gateway: HiveGateway,
    private readonly userId: string,
  ) {}

  async save(run: CanonicalStudyRun): Promise<CanonicalStudyRun> {
    const located = await this.getByIdempotencyKey(run.caseId, run.idempotencyKey);
    if (located) {
      if (
        (located.status === "RUNNING" || located.status === "QUEUED") &&
        (run.status === "RUNNING" || run.status === "QUEUED") &&
        located.studyRunId !== run.studyRunId
      ) {
        return located;
      }
      await this.gateway.upsert("study_runs", runToRow(
        {
          ...run,
          studyRunId: located.studyRunId,
          startedAt: located.startedAt,
        },
        this.userId,
      ), "id");
      const updated = await this.getByIdempotencyKey(run.caseId, run.idempotencyKey);
      return updated ?? persistedStudyRunFromLocated(run, located);
    }
    try {
      await this.gateway.insert("study_runs", runToRow(run, this.userId));
      const inserted = await this.getByIdempotencyKey(run.caseId, run.idempotencyKey);
      return inserted ?? run;
    } catch (error) {
      if (!isStudyIdempotencyConflict(error)) {
        throw error;
      }
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const raced = await this.getByIdempotencyKey(run.caseId, run.idempotencyKey);
        if (raced) {
          if (
            raced.status === "RUNNING" &&
            run.status === "RUNNING" &&
            raced.studyRunId !== run.studyRunId
          ) {
            return raced;
          }
          await this.gateway.upsert("study_runs", runToRow(
            {
              ...run,
              studyRunId: raced.studyRunId,
              startedAt: raced.startedAt,
            },
            this.userId,
          ), "id");
          const updated = await this.getByIdempotencyKey(run.caseId, run.idempotencyKey);
          return updated ?? persistedStudyRunFromLocated(run, raced);
        }
        if (attempt < 4) {
          await sleepMs(25 * (attempt + 1));
        }
      }
      throw error;
    }
  }

  async getByStudyRunId(studyRunId: string): Promise<CanonicalStudyRun | null> {
    const rows = await this.gateway.selectWhere(
      "study_runs",
      { id: studyRunId, user_id: this.userId },
      { limit: 1 },
    );
    return rows[0] ? mapRun(rows[0]) : null;
  }

  async getByIdempotencyKey(
    caseId: string,
    idempotencyKey: string,
  ): Promise<CanonicalStudyRun | null> {
    const rows = await this.gateway.selectWhere(
      "study_runs",
      { case_id: caseId, idempotency_key: idempotencyKey, user_id: this.userId },
      { limit: 1 },
    );
    return rows[0] ? mapRun(rows[0]) : null;
  }
}

export class SupabaseStudyContextRepository implements StudyContextRepository {
  constructor(
    private readonly gateway: HiveGateway,
    private readonly userId: string,
  ) {}

  async save(context: CanonicalStudyContext): Promise<void> {
    const contextHash = hashCanonicalJson(context);
    const existing = await this.gateway.selectWhere(
      "study_contexts",
      { study_run_id: context.studyRunId, user_id: this.userId },
      { limit: 1 },
    );
    if (existing[0]) {
      if (existing[0].context_hash !== contextHash) {
        throw new Error("STUDY_CONTEXT_IMMUTABLE");
      }
      return;
    }
    await this.gateway.insert(
      "study_contexts",
      withSessionOwner(this.userId, {
        id: context.studyRunId,
        study_run_id: context.studyRunId,
        case_id: context.caseId,
        user_id: this.userId,
        schema_version: context.schemaVersion,
        context_json: context,
        context_hash: contextHash,
        answer_snapshot_id: context.answerSnapshotId ?? null,
        answer_snapshot: context.answerSnapshot,
        created_at: context.createdAt,
      }),
    );
  }

  async getByStudyRunId(studyRunId: string): Promise<CanonicalStudyContext | null> {
    const rows = await this.gateway.selectWhere(
      "study_contexts",
      { study_run_id: studyRunId, user_id: this.userId },
      { limit: 1 },
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    return row.context_json as CanonicalStudyContext;
  }

  async getByIdempotencyKey(
    caseId: string,
    idempotencyKey: string,
  ): Promise<CanonicalStudyContext | null> {
    const rows = await this.gateway.selectWhere(
      "study_contexts",
      { case_id: caseId, user_id: this.userId },
    );
    const match = rows.find((row) => {
      const context = row.context_json as CanonicalStudyContext;
      return context.idempotencyKey === idempotencyKey;
    });
    return match ? (match.context_json as CanonicalStudyContext) : null;
  }
}

export class SupabaseStudyRunEventRepository implements StudyRunEventRepository {
  constructor(
    private readonly gateway: HiveGateway,
    private readonly userId: string,
  ) {}

  async append(event: StudyRunEvent): Promise<void> {
    await this.gateway.insert(
      "study_run_events",
      withSessionOwner(this.userId, {
        id: event.id,
        study_run_id: event.studyRunId,
        user_id: this.userId,
        case_id: event.caseId,
        event_type: event.type,
        event_payload: event.payload ?? {},
        created_at: event.occurredAt,
      }),
    );
  }

  async listByStudyRunId(studyRunId: string): Promise<StudyRunEvent[]> {
    const rows = await this.gateway.selectWhere("study_run_events", {
      study_run_id: studyRunId,
      user_id: this.userId,
    });
    return rows.map(mapEvent);
  }

  async listByCaseId(caseId: string): Promise<StudyRunEvent[]> {
    const rows = await this.gateway.selectWhere("study_run_events", {
      case_id: caseId,
      user_id: this.userId,
    });
    return rows.map(mapEvent);
  }
}

function mapEvent(row: HiveRow): StudyRunEvent {
  return {
    id: text(row, "id"),
    type: text(row, "event_type") as StudyRunEvent["type"],
    studyRunId: text(row, "study_run_id"),
    caseId: text(row, "case_id"),
    occurredAt: text(row, "created_at"),
    payload: (row.event_payload ?? undefined) as StudyRunEvent["payload"],
  };
}

export class SupabaseCaseIntelligenceRepository implements CaseIntelligenceRepository {
  constructor(
    private readonly gateway: HiveGateway,
    private readonly userId: string,
  ) {}

  async getLatestVersion(caseId: string): Promise<number | null> {
    const rows = await this.gateway.selectWhere(
      "case_intelligence_snapshots",
      { case_id: caseId, user_id: this.userId },
      { orderBy: "version", ascending: false, limit: 1 },
    );
    const row = rows[0];
    return row ? Number(row.version) : null;
  }

  async save(snapshot: PersistedCaseIntelligence): Promise<void> {
    const existing = await this.getByVersion(snapshot.caseId, snapshot.version);
    if (existing) {
      throw new Error("CASE_INTELLIGENCE_VERSION_EXISTS");
    }
    await this.gateway.insert(
      "case_intelligence_snapshots",
      withSessionOwner(this.userId, {
        id: randomUUID(),
        case_id: snapshot.caseId,
        study_run_id: snapshot.studyRunId,
        user_id: this.userId,
        version: snapshot.version,
        schema_version: snapshot.schemaVersion,
        intelligence_json: snapshot,
        validation_result_json: snapshot.validationResult,
        domain_pack_id: snapshot.domainPackId,
        domain_pack_version: snapshot.domainPackVersion,
        created_at: snapshot.createdAt,
      }),
    );
  }

  async getByVersion(
    caseId: string,
    version: number,
  ): Promise<PersistedCaseIntelligence | null> {
    const rows = await this.gateway.selectWhere(
      "case_intelligence_snapshots",
      { case_id: caseId, user_id: this.userId, version },
      { limit: 1 },
    );
    const row = rows[0];
    return row ? (row.intelligence_json as PersistedCaseIntelligence) : null;
  }
}
