import { clearClientCaseId } from "@/lib/canonical-study/map-start-request";
import type { CanonicalStudyOutcome } from "@/lib/canonical-study/study-client";
import type { IntakeEvidenceWorkspaceView, IntakeRunStatus } from "@hiveforyou/shared/intake";

export const HIVE_INTAKE_RUN_STORAGE_KEY = "hive-intake-run-id";

/** Clears client intake session keys so the home composer starts a new case/run. */
export function resetIntakeHomeSession(): void {
  clearStoredIntakeRun();
  clearClientCaseId();
}

export function clearStoredIntakeRun(): void {
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(HIVE_INTAKE_RUN_STORAGE_KEY);
  }
}

export function readStoredIntakeRunId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const value = window.sessionStorage.getItem(HIVE_INTAKE_RUN_STORAGE_KEY);
  return value?.trim() ? value : null;
}

export type StartIntakeResult = {
  intakeRunId: string;
  status: IntakeRunStatus;
};

export async function startIntakeRun(
  caseId: string,
  sourceDocumentIds: string[],
  purpose?: { rawIntent?: string | null; explicitDomainId?: string | null },
): Promise<StartIntakeResult> {
  const response = await fetch("/api/intake/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      caseId,
      sourceDocumentIds,
      rawIntent: purpose?.rawIntent ?? null,
      explicitDomainId: purpose?.explicitDomainId ?? null,
    }),
  });
  if (!response.ok) {
    let errorCode = "INTAKE_START_FAILED";
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) {
        errorCode = body.error;
      }
    } catch {
      errorCode = "INTAKE_START_FAILED";
    }
    throw new Error(errorCode);
  }
  const result = (await response.json()) as StartIntakeResult;
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(HIVE_INTAKE_RUN_STORAGE_KEY, result.intakeRunId);
  }
  return result;
}

export async function fetchIntakeRun(intakeRunId: string): Promise<IntakeEvidenceWorkspaceView> {
  const response = await fetch(`/api/intake/runs/${intakeRunId}`);
  if (!response.ok) {
    throw new Error("INTAKE_STATUS_FAILED");
  }
  return (await response.json()) as IntakeEvidenceWorkspaceView;
}

export async function setIntakeSourceDisposition(
  intakeRunId: string,
  sourceDocumentId: string,
  disposition: "PRESENT" | "DISCARDED",
): Promise<IntakeEvidenceWorkspaceView> {
  const response = await fetch(
    `/api/intake/runs/${intakeRunId}/sources/${sourceDocumentId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disposition }),
    },
  );
  if (!response.ok) {
    throw new Error("INTAKE_DISPOSITION_FAILED");
  }
  return (await response.json()) as IntakeEvidenceWorkspaceView;
}

/** @deprecated Prefer setIntakeSourceDisposition */
export async function discardIntakeSource(
  intakeRunId: string,
  sourceDocumentId: string,
): Promise<IntakeEvidenceWorkspaceView> {
  return setIntakeSourceDisposition(intakeRunId, sourceDocumentId, "DISCARDED");
}

export async function appendIntakeSources(
  intakeRunId: string,
  sourceDocumentIds: string[],
): Promise<void> {
  const response = await fetch(`/api/intake/runs/${intakeRunId}/sources`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceDocumentIds }),
  });
  if (!response.ok) {
    throw new Error("INTAKE_APPEND_FAILED");
  }
}

export async function startIntakeStudy(intakeRunId: string): Promise<CanonicalStudyOutcome> {
  const response = await fetch(`/api/intake/runs/${intakeRunId}/study`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error("INTAKE_STUDY_FAILED");
  }
  return (await response.json()) as CanonicalStudyOutcome;
}
