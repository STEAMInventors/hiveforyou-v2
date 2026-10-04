import { isTerminalIntakeRunStatus } from "@hiveforyou/shared/intake";

import type { IntakeExecutionDeps } from "./execute-intake";

export async function markIntakeRunWorkerFailed(
  deps: IntakeExecutionDeps,
  input: { userId: string; intakeRunId: string; errorCode: string },
): Promise<void> {
  const run = await deps.runs.getById(input.userId, input.intakeRunId);
  if (!run || isTerminalIntakeRunStatus(run.status)) {
    return;
  }
  const now = deps.now?.() ?? new Date().toISOString();
  await deps.runs.save({
    ...run,
    status: "FAILED",
    errorCode: input.errorCode,
    completedAt: now,
    updatedAt: now,
  });
}
