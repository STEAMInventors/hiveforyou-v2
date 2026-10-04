import type { CanonicalStudyRun } from "@hiveforyou/shared/canonical-study";
import type { StartCanonicalStudyRequest } from "@hiveforyou/shared/canonical-study";

export type CanonicalStudyOutcome = {
  run: CanonicalStudyRun;
  stage: "preparing" | "studying" | "checking" | "validating" | "saving" | "complete";
  reusedExistingRun: boolean;
};

export async function runCanonicalStudyViaApi(
  request: StartCanonicalStudyRequest,
): Promise<CanonicalStudyOutcome> {
  const response = await fetch("/api/study/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error("STUDY_API_FAILED");
  }
  return (await response.json()) as CanonicalStudyOutcome;
}
