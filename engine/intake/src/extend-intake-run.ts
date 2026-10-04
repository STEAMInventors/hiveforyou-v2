import { executeIntakeRun, type IntakeExecutionDeps } from "./execute-intake";
import { intakeFlightKey } from "./idempotency";
import { defaultIntakeInFlight, ensureIdentitiesForRun } from "./open-intake";
import type { IntakeRunRecord } from "./types";

export async function prepareExtendIntakeRun(
  deps: IntakeExecutionDeps,
  input: { userId: string; intakeRunId: string; sourceDocumentIds: string[] },
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

  await ensureIdentitiesForRun(deps, run, sourceDocumentIds);

  let activeRun = run;
  if (activeRun.status !== "RUNNING") {
    const now = deps.now?.() ?? new Date().toISOString();
    activeRun = {
      ...activeRun,
      status: "RUNNING",
      completedAt: null,
      errorCode: null,
      updatedAt: now,
    };
    await deps.runs.save(activeRun);
  }

  const flightMap = deps.inFlight ?? defaultIntakeInFlight;
  const flightKey = intakeFlightKey(activeRun.caseId, activeRun.idempotencyKey);

  const begin = (): Promise<IntakeRunRecord> => {
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
