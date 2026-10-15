import type { HiveExtractionProgressView } from "./hive-extraction-progress-types";

export async function fetchHiveExtractionProgress(
  caseId: string,
  studyRunId: string,
): Promise<HiveExtractionProgressView> {
  const response = await fetch(
    `/api/case/${encodeURIComponent(caseId)}/hive-extraction-progress?studyRunId=${encodeURIComponent(studyRunId)}`,
  );
  const payload = (await response.json()) as HiveExtractionProgressView & {
    error?: string;
    message?: string;
  };
  if (!response.ok) {
    throw new Error(payload.message ?? payload.error ?? "HIVE_EXTRACTION_PROGRESS_FAILED");
  }
  return payload;
}
