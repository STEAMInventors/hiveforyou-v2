import type { StudyRunErrorCode } from "@hiveforyou/shared/canonical-study";

const NON_RETRIABLE: ReadonlySet<StudyRunErrorCode> = new Set([
  "INVALID_STUDY_CONTEXT",
  "MALFORMED_PROPOSAL",
  "FIXTURE_MODE_NOT_ALLOWED",
  "INCOMPLETE_REQUIRED_QUESTIONS",
  "MISSING_STAGED_DOCUMENTS",
  "MISSING_DOMAIN_PACK",
  "STUDY_WORKER_FAILED",
  "STUDY_ARTIFACT_CONTENT_MISMATCH",
]);

export function isStudyNonRetriableErrorCode(code: string | null | undefined): boolean {
  if (!code) {
    return false;
  }
  return NON_RETRIABLE.has(code as StudyRunErrorCode);
}
