import type { RawExtractionInspectorBundle } from "@hiveforyou/core";

export async function fetchRawExtractionInspectorBundle(
  caseId: string,
  studyRunId: string,
): Promise<RawExtractionInspectorBundle | null> {
  const response = await fetch(
    `/api/case/${encodeURIComponent(caseId)}/raw-extraction?studyRunId=${encodeURIComponent(studyRunId)}`,
  );
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error("RAW_EXTRACTION_LOAD_FAILED");
  }
  return (await response.json()) as RawExtractionInspectorBundle;
}
