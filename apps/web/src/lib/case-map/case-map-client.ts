import type { CaseMapViewBundle } from "@/lib/case-map/case-map-view-bundle";

export async function fetchCaseMapViewBundle(studyRunId: string): Promise<CaseMapViewBundle> {
  const response = await fetch(`/api/study/runs/${encodeURIComponent(studyRunId)}/map`);
  if (!response.ok) {
    throw new Error("CASE_MAP_LOAD_FAILED");
  }
  return (await response.json()) as CaseMapViewBundle;
}
