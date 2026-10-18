import type { StudyRunStatus } from "../canonical-study/run.js";

export type HiveSelectionIntent = "new" | "existing";

/** Latest persisted workspace identifiers for an owned Hive (may be partially empty). */
export type OwnedHiveWorkspace = {
  intakeRunId: string | null;
  studyRunId: string | null;
  studyRunStatus: StudyRunStatus | null;
};

export type OwnedHiveSummary = {
  caseId: string;
  domainId: string | null;
  createdAt: string;
  updatedAt: string;
  workspace: OwnedHiveWorkspace;
};

export type OwnedHiveListResponse = {
  cases: OwnedHiveSummary[];
};

export type OwnedHiveDetailResponse = OwnedHiveSummary;