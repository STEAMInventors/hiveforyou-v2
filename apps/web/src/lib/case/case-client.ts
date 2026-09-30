import type { CaseViewBundle } from "@/lib/case/case-view-bundle";

export async function fetchCaseViewBundle(input: {
  caseId: string;
  intelligenceVersion?: number;
}): Promise<CaseViewBundle> {
  const params = new URLSearchParams();
  if (input.intelligenceVersion != null) {
    params.set("intelligenceVersion", String(input.intelligenceVersion));
  }
  const query = params.toString();
  const response = await fetch(
    `/api/case/${encodeURIComponent(input.caseId)}/bundle${query ? `?${query}` : ""}`,
  );
  if (!response.ok) {
    throw new Error("CASE_BUNDLE_FETCH_FAILED");
  }
  return (await response.json()) as CaseViewBundle;
}
