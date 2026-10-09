import { randomUUID } from "node:crypto";

import type { CanonicalStudyRun } from "@hiveforyou/shared/canonical-study";

import type { HiveGateway, HiveRow } from "./hive-gateway.js";

export const AGENT_RUN_TRACE_EVENT_TYPES = [
  "STARTED",
  "TOOL_CALLED",
  "FACT_PROPOSED",
  "EVIDENCE_ACCEPTED",
  "EVIDENCE_REJECTED",
  "COMPLETED",
  "FAILED",
] as const;

export type AgentRunTraceEventType = (typeof AGENT_RUN_TRACE_EVENT_TYPES)[number];

export type AgentRunTraceEventInput = {
  id: string;
  studyRunId: string;
  attemptId: string;
  sequenceNumber: number;
  caseId: string;
  userId: string;
  eventType: AgentRunTraceEventType;
  occurredAt: string;
  domainId: string;
  domainPackId: string;
  domainPackVersion: string;
  modelId: string | null;
  sourceDocumentIds: string[];
  payload: Record<string, unknown>;
};

export type AgentRunTraceAppendResult = "inserted" | "duplicate";

export class AgentRunTraceConflictError extends Error {
  constructor(
    message: string,
    readonly code: string = "TRACE_EVENT_CONFLICT",
  ) {
    super(message);
    this.name = "AgentRunTraceConflictError";
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FORBIDDEN_PAYLOAD_KEYS = new Set([
  "quote",
  "quotes",
  "text",
  "words",
  "pages",
  "prompt",
  "prompts",
  "messages",
  "authorization",
  "token",
  "apikey",
  "api_key",
  "password",
  "secret",
  "raw",
  "content",
  "documentbundle",
  "untrusted_document_bundle",
]);

export class AgentRunTraceValidationError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "AgentRunTraceValidationError";
  }
}

export class AgentRunTracePersistenceError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AgentRunTracePersistenceError";
  }
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

function assertUuid(field: string, value: string): void {
  if (!isUuid(value)) {
    throw new AgentRunTraceValidationError(`${field} must be a UUID.`, "INVALID_ID");
  }
}

export function assertBoundedTracePayload(payload: Record<string, unknown>): void {
  const visit = (value: unknown, path: string): void => {
    if (value == null || typeof value !== "object") {
      return;
    }
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        visit(value[index], `${path}[${index}]`);
      }
      return;
    }
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
      if (FORBIDDEN_PAYLOAD_KEYS.has(normalized)) {
        throw new AgentRunTraceValidationError(
          `Payload field "${key}" is not allowed in trace events.`,
          "FORBIDDEN_PAYLOAD_FIELD",
        );
      }
      visit(nested, path ? `${path}.${key}` : key);
    }
  };
  visit(payload, "");
}

export function validateAgentRunTraceEvent(raw: unknown): AgentRunTraceEventInput {
  if (!raw || typeof raw !== "object") {
    throw new AgentRunTraceValidationError("Event must be an object.", "INVALID_EVENT");
  }
  const record = raw as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const studyRunId = typeof record.studyRunId === "string" ? record.studyRunId.trim() : "";
  const attemptId = typeof record.attemptId === "string" ? record.attemptId.trim() : "";
  const caseId = typeof record.caseId === "string" ? record.caseId.trim() : "";
  const userId = typeof record.userId === "string" ? record.userId.trim() : "";
  const eventType = typeof record.eventType === "string" ? record.eventType.trim() : "";
  const occurredAt = typeof record.occurredAt === "string" ? record.occurredAt.trim() : "";
  const domainId = typeof record.domainId === "string" ? record.domainId.trim() : "";
  const domainPackId = typeof record.domainPackId === "string" ? record.domainPackId.trim() : "";
  const domainPackVersion =
    typeof record.domainPackVersion === "string" ? record.domainPackVersion.trim() : "";
  const modelId =
    typeof record.modelId === "string"
      ? record.modelId.trim() || null
      : record.modelId === null
        ? null
        : null;
  const sequenceRaw = record.sequenceNumber;
  const sequenceNumber =
    typeof sequenceRaw === "number" && Number.isInteger(sequenceRaw) ? sequenceRaw : NaN;

  if (!id || !studyRunId || !attemptId || !caseId || !userId || !eventType || !occurredAt) {
    throw new AgentRunTraceValidationError("Missing required trace event fields.", "INVALID_EVENT");
  }
  for (const [field, value] of [
    ["id", id],
    ["studyRunId", studyRunId],
    ["attemptId", attemptId],
    ["caseId", caseId],
    ["userId", userId],
  ] as const) {
    assertUuid(field, value);
  }
  if (!Number.isInteger(sequenceNumber) || sequenceNumber < 0) {
    throw new AgentRunTraceValidationError(
      "sequenceNumber must be a non-negative integer.",
      "INVALID_SEQUENCE",
    );
  }
  if (!AGENT_RUN_TRACE_EVENT_TYPES.includes(eventType as AgentRunTraceEventType)) {
    throw new AgentRunTraceValidationError("Unsupported eventType.", "INVALID_EVENT_TYPE");
  }
  if (Number.isNaN(Date.parse(occurredAt))) {
    throw new AgentRunTraceValidationError("occurredAt must be ISO-8601.", "INVALID_TIMESTAMP");
  }
  if (!domainId || !domainPackId || !domainPackVersion) {
    throw new AgentRunTraceValidationError("Domain pack metadata is required.", "INVALID_DOMAIN");
  }

  const sourceDocumentIdsRaw = record.sourceDocumentIds;
  if (!Array.isArray(sourceDocumentIdsRaw)) {
    throw new AgentRunTraceValidationError(
      "sourceDocumentIds must be an array.",
      "INVALID_SOURCE_DOCUMENTS",
    );
  }
  const sourceDocumentIds: string[] = [];
  for (const item of sourceDocumentIdsRaw) {
    if (typeof item !== "string" || !item.trim()) {
      throw new AgentRunTraceValidationError(
        "sourceDocumentIds entries must be non-empty strings.",
        "INVALID_SOURCE_DOCUMENTS",
      );
    }
    sourceDocumentIds.push(item.trim());
  }

  const payloadRaw = record.payload;
  const payload =
    payloadRaw && typeof payloadRaw === "object" && !Array.isArray(payloadRaw)
      ? (payloadRaw as Record<string, unknown>)
      : {};
  assertBoundedTracePayload(payload);

  return {
    id,
    studyRunId,
    attemptId,
    sequenceNumber,
    caseId,
    userId,
    eventType: eventType as AgentRunTraceEventType,
    occurredAt,
    domainId,
    domainPackId,
    domainPackVersion,
    modelId,
    sourceDocumentIds,
    payload,
  };
}

export function isUniqueViolation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("duplicate key") || message.includes("23505");
}

export async function loadStudyRunForTraceScope(
  gateway: HiveGateway,
  input: { studyRunId: string; caseId: string; userId: string },
): Promise<CanonicalStudyRun | null> {
  const rows = await gateway.selectWhere(
    "study_runs",
    { id: input.studyRunId, case_id: input.caseId, user_id: input.userId },
    { limit: 1 },
  );
  const row = rows[0];
  if (!row) {
    return null;
  }
  return mapStudyRunRow(row);
}

async function loadCaseForUser(
  gateway: HiveGateway,
  input: { caseId: string; userId: string },
): Promise<boolean> {
  const rows = await gateway.selectWhere(
    "cases",
    { id: input.caseId, user_id: input.userId },
    { limit: 1 },
  );
  return rows.length > 0;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, nested) => {
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      return Object.keys(nested as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = (nested as Record<string, unknown>)[key];
          return acc;
        }, {});
    }
    return nested;
  });
}

function persistedRowMatchesEvent(row: HiveRow, event: AgentRunTraceEventInput): boolean {
  const payload = row.event_payload ?? {};
  const sourceDocs = row.source_document_ids;
  return (
    String(row.study_run_id) === event.studyRunId &&
    String(row.attempt_id) === event.attemptId &&
    Number(row.sequence_number) === event.sequenceNumber &&
    String(row.user_id) === event.userId &&
    String(row.case_id) === event.caseId &&
    String(row.event_type) === event.eventType &&
    String(row.occurred_at) === event.occurredAt &&
    String(row.domain_id) === event.domainId &&
    String(row.domain_pack_id) === event.domainPackId &&
    String(row.domain_pack_version) === event.domainPackVersion &&
    (row.model_id == null ? event.modelId == null : String(row.model_id) === event.modelId) &&
    stableJson(sourceDocs) === stableJson(event.sourceDocumentIds) &&
    stableJson(payload) === stableJson(event.payload)
  );
}

function mapStudyRunRow(row: HiveRow): CanonicalStudyRun {
  const studyRunId = String(row.id);
  return {
    studyRunId,
    caseId: String(row.case_id),
    idempotencyKey: String(row.idempotency_key),
    studyContextId: studyRunId,
    domainId: String(row.domain_id),
    domainPackId: String(row.domain_pack_id),
    domainPackVersion: String(row.domain_pack_version),
    questionSetVersion: String(row.question_set_version),
    answerSnapshotHash: String(row.answer_snapshot_hash),
    providerId: String(row.provider_id),
    providerMode: String(row.provider_mode) as CanonicalStudyRun["providerMode"],
    promptId: String(row.prompt_id),
    promptVersion: String(row.prompt_version),
    promptSha256: String(row.prompt_sha256),
    startedAt: String(row.started_at),
    status: String(row.status) as CanonicalStudyRun["status"],
  };
}

export class AgentRunTraceRepository {
  constructor(private readonly gateway: HiveGateway) {}

  async append(event: AgentRunTraceEventInput): Promise<AgentRunTraceAppendResult> {
    const row = {
      id: event.id,
      study_run_id: event.studyRunId,
      attempt_id: event.attemptId,
      sequence_number: event.sequenceNumber,
      user_id: event.userId,
      case_id: event.caseId,
      event_type: event.eventType,
      occurred_at: event.occurredAt,
      domain_id: event.domainId,
      domain_pack_id: event.domainPackId,
      domain_pack_version: event.domainPackVersion,
      model_id: event.modelId,
      source_document_ids: event.sourceDocumentIds,
      event_payload: event.payload,
    };
    try {
      await this.gateway.insert("agent_run_trace_events", row);
      return "inserted";
    } catch (error) {
      if (isUniqueViolation(error)) {
        return this.reconcileDuplicate(event);
      }
      throw new AgentRunTracePersistenceError("Failed to persist agent run trace event.", error);
    }
  }

  private async reconcileDuplicate(
    event: AgentRunTraceEventInput,
  ): Promise<AgentRunTraceAppendResult> {
    const byId = await this.gateway.selectWhere(
      "agent_run_trace_events",
      { id: event.id },
      { limit: 1 },
    );
    if (byId[0]) {
      if (persistedRowMatchesEvent(byId[0], event)) {
        return "duplicate";
      }
      throw new AgentRunTraceConflictError(
        "Trace event id already exists with different content.",
      );
    }

    const bySequence = await this.gateway.selectWhere(
      "agent_run_trace_events",
      { attempt_id: event.attemptId, sequence_number: event.sequenceNumber },
      { limit: 1 },
    );
    if (bySequence[0]) {
      if (String(bySequence[0].id) !== event.id) {
        throw new AgentRunTraceConflictError(
          "Trace attempt sequence already exists with a different event id.",
        );
      }
      if (persistedRowMatchesEvent(bySequence[0], event)) {
        return "duplicate";
      }
      throw new AgentRunTraceConflictError(
        "Trace attempt sequence already exists with different content.",
      );
    }

    throw new AgentRunTraceConflictError(
      "Trace event could not be inserted due to a uniqueness conflict.",
    );
  }

  async appendWithScopeValidation(event: AgentRunTraceEventInput): Promise<AgentRunTraceAppendResult> {
    const caseOk = await loadCaseForUser(this.gateway, {
      caseId: event.caseId,
      userId: event.userId,
    });
    if (!caseOk) {
      throw new AgentRunTraceValidationError(
        "Case not found for user.",
        "CASE_SCOPE_VIOLATION",
      );
    }
    const studyRun = await loadStudyRunForTraceScope(this.gateway, {
      studyRunId: event.studyRunId,
      caseId: event.caseId,
      userId: event.userId,
    });
    if (!studyRun) {
      throw new AgentRunTraceValidationError(
        "Study run not found for case and user.",
        "STUDY_RUN_SCOPE_VIOLATION",
      );
    }
    if (studyRun.domainId !== event.domainId) {
      throw new AgentRunTraceValidationError(
        "domainId does not match study run.",
        "DOMAIN_MISMATCH",
      );
    }
    return this.append(event);
  }
}

export function newTraceEventId(): string {
  return randomUUID();
}
