import { describe, expect, it } from "vitest";

import type { CanonicalStudyRun } from "@hiveforyou/shared/canonical-study";

import { InMemoryStudyRunEventRepository } from "./event-repository";
import { markStudyRunWorkerFailed } from "./mark-study-run-worker-failed";
import { InMemoryStudyRunRepository } from "./repositories";

function runningRun(): CanonicalStudyRun {
  return {
    studyRunId: "33333333-3333-4333-8333-333333333333",
    caseId: "44444444-4444-4444-8444-444444444444",
    idempotencyKey: "idem-1",
    studyContextId: "33333333-3333-4333-8333-333333333333",
    domainId: "iep",
    domainPackId: "hive.domain.iep",
    domainPackVersion: "scaffold/1",
    questionSetVersion: "qs-1",
    answerSnapshotHash: "hash",
    providerId: "fixture-canonical-study-engine",
    providerMode: "fixture",
    promptId: "canonical-study-v4",
    promptVersion: "v4",
    promptSha256: "abc",
    startedAt: new Date().toISOString(),
    status: "RUNNING",
  };
}

describe("markStudyRunWorkerFailed", () => {
  it("marks a RUNNING study run FAILED with terminal events", async () => {
    const runRepo = new InMemoryStudyRunRepository();
    const eventRepo = new InMemoryStudyRunEventRepository();
    await runRepo.save(runningRun());

    await markStudyRunWorkerFailed(runRepo, eventRepo, {
      userId: "user-1",
      studyRunId: runningRun().studyRunId,
      errorCode: "STUDY_WORKER_FAILED",
    });

    const updated = await runRepo.getByStudyRunId(runningRun().studyRunId);
    expect(updated?.status).toBe("FAILED");
    expect(updated?.errorCode).toBe("STUDY_WORKER_FAILED");
    expect(updated?.completedAt).toBeTruthy();

    const events = await eventRepo.listByStudyRunId(runningRun().studyRunId);
    expect(events.some((e) => e.type === "study_run.failed")).toBe(true);
    expect(events.some((e) => e.type === "study_run.completed")).toBe(true);
  });

  it("no-ops when the run is already terminal", async () => {
    const runRepo = new InMemoryStudyRunRepository();
    const eventRepo = new InMemoryStudyRunEventRepository();
    const failed = {
      ...runningRun(),
      status: "FAILED" as const,
      completedAt: new Date().toISOString(),
      errorCode: "MALFORMED_PROPOSAL" as const,
    };
    await runRepo.save(failed);

    await markStudyRunWorkerFailed(runRepo, eventRepo, {
      userId: "user-1",
      studyRunId: failed.studyRunId,
      errorCode: "STUDY_WORKER_FAILED",
    });

    const events = await eventRepo.listByStudyRunId(failed.studyRunId);
    expect(events).toHaveLength(0);
  });
});
