import { randomUUID } from "node:crypto";

import {
  INTAKE_CLASSIFIER,
  isTerminalIntakeRunStatus,
  type IntakeRunStatus,
} from "@hiveforyou/shared/intake";

import { executeIntakeRun, type IntakeExecutionDeps } from "./execute-intake";
import { buildIntakeIdempotencyKey, intakeFlightKey } from "./idempotency";
import { isIntakeConflict } from "./repositories";
import type { DocumentIdentityRecord, IntakeRunRecord } from "./types";

export const defaultIntakeInFlight = new Map<string, Promise<IntakeRunRecord>>();

export type OpenIntakeRunInput = {
  userId: string;
  caseId: string;
  sourceDocumentIds: string[];
  rawIntent?: string | null;
  explicitDomainId?: string | null;
  /** Defaults to RUNNING (inline). Worker queue uses QUEUED. */
  initialRunStatus?: IntakeRunStatus;
};

export type OpenedIntakeRun = {
  run: IntakeRunRecord;
  begin: () => Promise<IntakeRunRecord>;
};

export async function openIntakeRun(
  deps: IntakeExecutionDeps,
  input: OpenIntakeRunInput,
): Promise<OpenedIntakeRun> {
  const sourceDocumentIds = [...new Set(input.sourceDocumentIds.map((id) => id.trim()).filter(Boolean))];
  if (!input.userId.trim() || !input.caseId.trim() || sourceDocumentIds.length === 0) {
    throw new Error("INTAKE_REQUEST_INVALID");
  }
  const idempotencyKey = buildIntakeIdempotencyKey(sourceDocumentIds);
  const existing = await deps.runs.getByIdempotencyKey(input.userId, input.caseId, idempotencyKey);
  const run =
    existing ??
    (await createRun(deps, input, idempotencyKey, input.initialRunStatus ?? "RUNNING"));
  await ensureIdentitiesForRun(deps, run, sourceDocumentIds);

  const refreshed = (await deps.runs.getById(run.userId, run.id)) ?? run;
  const flightMap = deps.inFlight ?? defaultIntakeInFlight;
  const flightKey = intakeFlightKey(refreshed.caseId, refreshed.idempotencyKey);

  const begin = (): Promise<IntakeRunRecord> => {
    if (isTerminalIntakeRunStatus(refreshed.status)) {
      return Promise.resolve(refreshed);
    }
    const current = flightMap.get(flightKey);
    if (current) {
      return current;
    }
    const promise = executeIntakeRun(deps, refreshed.id, refreshed.userId).finally(() => {
      if (flightMap.get(flightKey) === promise) {
        flightMap.delete(flightKey);
      }
    });
    flightMap.set(flightKey, promise);
    return promise;
  };

  return { run: refreshed, begin };
}

async function createRun(
  deps: IntakeExecutionDeps,
  input: OpenIntakeRunInput,
  idempotencyKey: string,
  initialStatus: IntakeRunStatus,
): Promise<IntakeRunRecord> {
  const now = deps.now?.() ?? new Date().toISOString();
  const run: IntakeRunRecord = {
    id: deps.createId?.() ?? randomUUID(),
    caseId: input.caseId,
    userId: input.userId,
    idempotencyKey,
    status: initialStatus,
    classifier: INTAKE_CLASSIFIER,
    classifierVersion: null,
    startedAt: now,
    completedAt: null,
    errorCode: null,
    rawIntent: input.rawIntent?.trim() || null,
    explicitDomainId: input.explicitDomainId?.trim() || null,
    jevDomainProposal: null,
    jevDomainConfidence: null,
    resolvedDomainId: null,
    resolutionSource: null,
    studyPath: null,
    packExecutionJson: null,
    intakeQueueSeq: 0,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await deps.runs.insert(run);
    return run;
  } catch (error) {
    if (!isIntakeConflict(error)) {
      throw error;
    }
    const winner = await deps.runs.getByIdempotencyKey(input.userId, input.caseId, idempotencyKey);
    if (!winner) {
      throw error;
    }
    return winner;
  }
}

export async function ensureIdentitiesForRun(
  deps: IntakeExecutionDeps,
  run: IntakeRunRecord,
  sourceDocumentIds: string[],
): Promise<void> {
  const existing = await deps.identities.listByRun(run.userId, run.id);
  const present = new Set(existing.map((row) => row.sourceDocumentId));
  let offset = 0;
  for (const sourceDocumentId of sourceDocumentIds) {
    if (present.has(sourceDocumentId)) {
      continue;
    }
    const createdAt = new Date(Date.parse(run.createdAt) + offset).toISOString();
    offset += 1;
    const record: DocumentIdentityRecord = {
      id: deps.createId?.() ?? randomUUID(),
      intakeRunId: run.id,
      sourceDocumentId,
      userId: run.userId,
      caseId: run.caseId,
      processingStatus: "UPLOADED",
      proposedType: null,
      confidence: null,
      proposedBy: null,
      classifierVersion: null,
      returnedModel: null,
      classifiedAt: null,
      errorCode: null,
      analysisDisposition: "PRESENT",
      createdAt,
      updatedAt: createdAt,
    };
    try {
      await deps.identities.insert(record);
    } catch (error) {
      if (!isIntakeConflict(error)) {
        throw error;
      }
    }
  }
}
