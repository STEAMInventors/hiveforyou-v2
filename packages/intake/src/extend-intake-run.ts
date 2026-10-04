import { isTerminalIntakeRunStatus, type IntakeRunStatus } from "@hiveforyou/shared/intake";

import { executeIntakeRun, type IntakeExecutionDeps } from "./execute-intake";
import { intakeFlightKey } from "./idempotency";
import { defaultIntakeInFlight, ensureIdentitiesForRun } from "./open-intake";
import type { IntakeRunRecord } from "./types";

export async function prepareExtendIntakeRun(
  deps: IntakeExecutionDeps,
  input: {
    userId: string;
    intakeRunId: string;
    sourceDocumentIds: string[];
    activeRunStatus?: IntakeRunStatus;
  },
): Promise<{ run: IntakeRunRecord; begin: () => Promise<IntakeRunRecord> }> {
  const sourceDocumentIds = [
    ...new Set(input.sourceDocumentIds.map((id) => id.trim()).filter(Boolean)),
  ];
  if (!input.userId.trim() || !input.intakeRunId.trim() || sourceDocumentIds.length === 0) {
    throw new Error("INTAKE_REQUEST_INVALID");
  }

  const run = await deps.runs.getById(input.userId, input.intakeRunId);
  if (!run) {
    throw new Error("INTAKE_RUN_NOT_FOUND");
  }

  const beforeCount = (await deps.identities.listByRun(input.userId, input.intakeRunId)).length;
  await ensureIdentitiesForRun(deps, run, sourceDocumentIds);
  const afterCount = (await deps.identities.listByRun(input.userId, input.intakeRunId)).length;
  const addedSources = afterCount > beforeCount;

  const targetStatus = input.activeRunStatus ?? "RUNNING";
  let activeRun = run;
  if (isTerminalIntakeRunStatus(activeRun.status) || addedSources) {
    const now = deps.now?.() ?? new Date().toISOString();
    const nextQueueSeq =
      targetStatus === "QUEUED" && (addedSources || isTerminalIntakeRunStatus(run.status))
        ? activeRun.intakeQueueSeq + 1
        : activeRun.intakeQueueSeq;
    activeRun = {
      ...activeRun,
      status: targetStatus,
      intakeQueueSeq: nextQueueSeq,
      completedAt: null,
      errorCode: null,
      updatedAt: now,
    };
    await deps.runs.save(activeRun);
  }

  const flightMap = deps.inFlight ?? defaultIntakeInFlight;
  const flightKey = intakeFlightKey(activeRun.caseId, activeRun.idempotencyKey);

  const begin = (): Promise<IntakeRunRecord> => {
    if (isTerminalIntakeRunStatus(activeRun.status)) {
      return Promise.resolve(activeRun);
    }
    const current = flightMap.get(flightKey);
    if (current) {
      return current;
    }
    const promise = executeIntakeRun(deps, activeRun.id, activeRun.userId).finally(() => {
      if (flightMap.get(flightKey) === promise) {
        flightMap.delete(flightKey);
      }
    });
    flightMap.set(flightKey, promise);
    return promise;
  };

  return { run: activeRun, begin };
}

export async function extendIntakeRun(
  deps: IntakeExecutionDeps,
  input: { userId: string; intakeRunId: string; sourceDocumentIds: string[] },
): Promise<IntakeRunRecord> {
  const opened = await prepareExtendIntakeRun(deps, input);
  return opened.begin();
}
