import { describe, expect, it } from "vitest";

import { resolveOwnedHiveWorkspaceForCase } from "./owned-hive-workspace";

describe("resolveOwnedHiveWorkspaceForCase", () => {
  it("picks the latest study and intake runs per case", () => {
    const workspace = resolveOwnedHiveWorkspaceForCase({
      caseId: "case-a",
      studyRuns: [
        {
          caseId: "case-a",
          studyRunId: "study-old",
          intakeRunId: "intake-from-old-study",
          status: "SUCCEEDED",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          caseId: "case-a",
          studyRunId: "study-new",
          intakeRunId: null,
          status: "RUNNING",
          updatedAt: "2026-02-01T00:00:00.000Z",
        },
      ],
      intakeRuns: [
        {
          caseId: "case-a",
          intakeRunId: "intake-latest",
          updatedAt: "2026-02-15T00:00:00.000Z",
        },
      ],
    });

    expect(workspace.studyRunId).toBe("study-new");
    expect(workspace.studyRunStatus).toBe("RUNNING");
    expect(workspace.intakeRunId).toBe("intake-latest");
  });

  it("returns empty workspace identifiers when no runs exist", () => {
    expect(
      resolveOwnedHiveWorkspaceForCase({
        caseId: "case-empty",
        studyRuns: [],
        intakeRuns: [],
      }),
    ).toEqual({
      intakeRunId: null,
      studyRunId: null,
      studyRunStatus: null,
    });
  });
});
