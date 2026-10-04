export type StudyRunEventType =
  | "study_run.started"
  | "study_run.engine_completed"
  | "study_run.validation_completed"
  | "study_run.completed"
  | "study_run.failed";

export type StudyRunEvent = {
  id: string;
  type: StudyRunEventType;
  studyRunId: string;
  caseId: string;
  occurredAt: string;
  payload?: Record<string, unknown>;
};
