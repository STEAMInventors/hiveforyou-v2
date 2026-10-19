import { clearClientCaseId } from "@/lib/canonical-study/map-start-request";
import type { CanonicalStudyOutcome } from "@/lib/canonical-study/study-client";
import type { IntakeEvidenceWorkspaceView, IntakeRunStatus } from "@hiveforyou/shared/intake";

export const HIVE_INTAKE_RUN_STORAGE_KEY = "hive-intake-run-id";

const UNRECOVERABLE_INTAKE_STATUS_ERRORS = new Set([
  "UNAUTHENTICATED",
  "INTAKE_NOT_FOUND",
  "INVALID_BODY",
  "UNEXPECTED",
]);

/** Clears in-flight intake run state without dropping the selected Hive case id. */
export function clearIntakeRunForNewUpload(): void {
  clearStoredIntakeRun();
}

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

export function isUnrecoverableIntakeStatusError(code: string): boolean {
  return UNRECOVERABLE_INTAKE_STATUS_ERRORS.has(code);
}

function readIntakeApiError(body: unknown, fallback: string): string {
  if (typeof body === "object" && body !== null && "error" in body) {
    const error = (body as { error?: unknown }).error;
    if (typeof error === "string" && error.trim()) {
      return error.trim();
    }
  }
  return fallback;
}

export async function startIntakeRun(
  caseId: string,
  sourceDocumentIds: string[],
  purpose?: { rawIntent?: string | null; selectedDomainId?: string | null },
  options?: { processDocuments?: boolean },
): Promise<StartIntakeResult> {
  const response = await fetch("/api/intake/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      caseId,
      sourceDocumentIds,
      rawIntent: purpose?.rawIntent ?? null,
      selectedDomainId: purpose?.selectedDomainId ?? null,
      processDocuments: options?.processDocuments === true,
    }),
  });
  const body = (await response.json().catch(() => null)) as
    | (StartIntakeResult & { error?: string })
    | null;
  if (!response.ok || body?.error) {
    throw new Error(readIntakeApiError(body, "INTAKE_START_FAILED"));
  }
  const result = body as StartIntakeResult;
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(HIVE_INTAKE_RUN_STORAGE_KEY, result.intakeRunId);
  }
  return result;
}

export async function fetchIntakeRun(intakeRunId: string): Promise<IntakeEvidenceWorkspaceView> {
  const response = await fetch(`/api/intake/runs/${intakeRunId}`);
  const body = (await response.json().catch(() => null)) as
    | (IntakeEvidenceWorkspaceView & { error?: string })
    | null;
  if (!response.ok || body?.error || !body?.intakeRunId) {
    throw new Error(readIntakeApiError(body, "INTAKE_STATUS_FAILED"));
  }
  return body;
}

export async function processIntakeRun(intakeRunId: string): Promise<{ status: IntakeRunStatus }> {
  const response = await fetch(`/api/intake/runs/${encodeURIComponent(intakeRunId)}/process`, {
    method: "POST",
  });
  const body = (await response.json().catch(() => null)) as
    | ({ status: IntakeRunStatus; intakeRunId?: string } & { error?: string })
    | null;
  if (!response.ok || body?.error) {
    throw new Error(readIntakeApiError(body, "INTAKE_PROCESS_FAILED"));
  }
  return { status: body!.status };
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

export async function startIntakeStudy(
  intakeRunId: string,
  options?: { processingMode?: "canonical_openai_v4" | "pack_driven_v1" },
): Promise<CanonicalStudyOutcome> {
  const response = await fetch(`/api/intake/runs/${intakeRunId}/study`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      options?.processingMode ? { processingMode: options.processingMode } : {},
    ),
  });
  if (!response.ok) {
    throw new Error("INTAKE_STUDY_FAILED");
  }
  return (await response.json()) as CanonicalStudyOutcome;
}
