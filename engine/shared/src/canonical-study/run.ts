import type { CanonicalStudyValidationResult } from "./validation";

export type StudyRunStatus =
  | "QUEUED"
  | "RUNNING"
  | "SUCCEEDED"
  | "NEEDS_REVIEW"
  | "FAILED";

export type StudyRunErrorCode =
  | "INCOMPLETE_REQUIRED_QUESTIONS"
  | "MISSING_STAGED_DOCUMENTS"
  | "MISSING_DOMAIN_PACK"
  | "INVALID_STUDY_CONTEXT"
  | "ENGINE_UNAVAILABLE"
  | "MALFORMED_PROPOSAL"
  | "PERSISTENCE_FAILURE"
  | "FIXTURE_MODE_NOT_ALLOWED"
  | "STUDY_WORKER_FAILED"
  | "STUDY_ARTIFACT_CONTENT_MISMATCH"
  | "UNEXPECTED";

export type CanonicalStudyRun = {
  studyRunId: string;
  caseId: string;
  /** Set when study was started from an Intake Evidence Workspace run. */
  intakeRunId?: string;
  idempotencyKey: string;
  studyContextId: string;
  domainId: string;
  domainPackId: string;
  domainPackVersion: string;
  questionSetVersion: string;
  answerSnapshotHash: string;
  providerId: string;
  providerMode: "fixture" | "openai" | "anthropic" | "unconfigured";
  promptId?: string;
  promptVersion?: string;
  promptSha256?: string;
  startedAt: string;
  completedAt?: string;
  status: StudyRunStatus;
  errorCode?: StudyRunErrorCode;
  errorMessage?: string;
  validationResult?: CanonicalStudyValidationResult;
  caseIntelligenceVersion?: number;
};
