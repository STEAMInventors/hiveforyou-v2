export type RunDeterministicCanonicalStudyClientResult = {
  studyRunId: string;
};

export async function runDeterministicCanonicalStudyFromClient(input: {
  caseId: string;
  studyRunId: string;
}): Promise<RunDeterministicCanonicalStudyClientResult> {
  const response = await fetch(
    `/api/case/${encodeURIComponent(input.caseId)}/canonical-study/run`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studyRunId: input.studyRunId }),
    },
  );
  const payload = (await response.json()) as {
    studyRunId?: string;
    error?: string;
    message?: string;
  };
  if (!response.ok) {
    throw new Error(payload.message ?? payload.error ?? "CANONICAL_STUDY_RUN_FAILED");
  }
  const studyRunId = payload.studyRunId?.trim() ?? input.studyRunId;
  return { studyRunId };
}
