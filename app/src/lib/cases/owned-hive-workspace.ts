import type { StudyRunStatus } from "@hiveforyou/shared/canonical-study";
import type { OwnedHiveWorkspace } from "@hiveforyou/shared/cases";

export type StudyRunWorkspaceRef = {
  caseId: string;
  studyRunId: string;
  intakeRunId: string | null;
  status: StudyRunStatus;
  updatedAt: string;
};

export type IntakeRunWorkspaceRef = {
  caseId: string;
  intakeRunId: string;
  updatedAt: string;
};

const EMPTY_WORKSPACE: OwnedHiveWorkspace = {
  intakeRunId: null,
  studyRunId: null,
  studyRunStatus: null,
};

function compareRecency(left: string, right: string): number {
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  if (Number.isNaN(leftMs) && Number.isNaN(rightMs)) {
    return 0;
  }
  if (Number.isNaN(leftMs)) {
    return 1;
  }
  if (Number.isNaN(rightMs)) {
    return -1;
  }
  return rightMs - leftMs;
}

export function resolveOwnedHiveWorkspaceForCase(input: {
  caseId: string;
  studyRuns: StudyRunWorkspaceRef[];
  intakeRuns: IntakeRunWorkspaceRef[];
}): OwnedHiveWorkspace {
  const latestStudy = input.studyRuns
    .filter((run) => run.caseId === input.caseId)
    .sort((left, right) => compareRecency(left.updatedAt, right.updatedAt))[0];
  const latestIntake = input.intakeRuns
    .filter((run) => run.caseId === input.caseId)
    .sort((left, right) => compareRecency(left.updatedAt, right.updatedAt))[0];

  if (!latestStudy && !latestIntake) {
    return EMPTY_WORKSPACE;
  }

  return {
    studyRunId: latestStudy?.studyRunId ?? null,
    studyRunStatus: latestStudy?.status ?? null,
    intakeRunId: latestStudy?.intakeRunId ?? latestIntake?.intakeRunId ?? null,
  };
}

export function indexOwnedHiveWorkspacesByCaseId(input: {
  caseIds: string[];
  studyRuns: StudyRunWorkspaceRef[];
  intakeRuns: IntakeRunWorkspaceRef[];
}): Map<string, OwnedHiveWorkspace> {
  const workspaces = new Map<string, OwnedHiveWorkspace>();
  for (const caseId of input.caseIds) {
    workspaces.set(
      caseId,
      resolveOwnedHiveWorkspaceForCase({
        caseId,
        studyRuns: input.studyRuns,
        intakeRuns: input.intakeRuns,
      }),
    );
  }
  return workspaces;
}
