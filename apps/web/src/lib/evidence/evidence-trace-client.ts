import type { ResolvedEvidenceRef } from "@hiveforyou/shared/projections";

export async function fetchEvidenceTrace(input: {
  studyRunId: string;
  evidenceRefId: string;
}): Promise<ResolvedEvidenceRef> {
  const response = await fetch(
    `/api/study/runs/${encodeURIComponent(input.studyRunId)}/evidence/${encodeURIComponent(input.evidenceRefId)}`,
  );
  if (!response.ok) {
    throw new Error("EVIDENCE_TRACE_FAILED");
  }
  const body = (await response.json()) as { evidence: ResolvedEvidenceRef };
  return body.evidence;
}
