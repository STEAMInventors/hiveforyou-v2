import { finalizeIntakeRunPack } from "./finalize-intake-pack";
import type { IntakeExecutionDeps } from "./execute-intake";
import type { IntakeSourceAnalysisDisposition, IntakeRunRecord } from "./types";

export async function setIntakeSourceAnalysisDisposition(
  deps: IntakeExecutionDeps,
  input: {
    userId: string;
    intakeRunId: string;
    sourceDocumentId: string;
    disposition: IntakeSourceAnalysisDisposition;
  },
): Promise<IntakeRunRecord> {
  const identities = await deps.identities.listByRun(input.userId, input.intakeRunId);
  const identity = identities.find((row) => row.sourceDocumentId === input.sourceDocumentId);
  if (!identity) {
    throw new Error("INTAKE_SOURCE_NOT_FOUND");
  }

  const now = deps.now?.() ?? new Date().toISOString();
  identity.analysisDisposition = input.disposition;
  identity.updatedAt = now;
  await deps.identities.save(identity);

  const run = await deps.runs.getById(input.userId, input.intakeRunId);
  if (!run) {
    throw new Error("INTAKE_RUN_NOT_FOUND");
  }
  if (run.status === "RUNNING" || run.status === "QUEUED") {
    return run;
  }

  const updated = await finalizeIntakeRunPack(deps, run);
  await deps.runs.save(updated);
  return updated;
}
