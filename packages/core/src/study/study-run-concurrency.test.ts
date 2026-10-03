import { describe, expect, it } from "vitest";

import { InMemoryCaseIntelligenceRepository } from "@hiveforyou/canonical";

import { FixtureCanonicalStudyEngine } from "./engine";
import { InMemoryStudyRunEventRepository } from "./event-repository";
import { loadCanonicalStudyPrompt } from "../prompts/load-canonical-study-prompt";
import {
  InMemoryStudyContextRepository,
  InMemoryStudyRunRepository,
  type StudyRunRepository,
} from "./repositories";
import { runCanonicalStudy, type StudyServiceDeps } from "./run-canonical-study";
import type { CanonicalStudyRun } from "@hiveforyou/shared/canonical-study";
import type { StartCanonicalStudyRequest } from "@hiveforyou/shared/canonical-study";

function baseRequest(): StartCanonicalStudyRequest {
  return {
    caseId: "case-concurrency-1",
    sourceDocuments: [
      {
        stagedDocumentId: "staged-1",
        discoveryDocumentId: "doc-staged-1",
        originalFilename: "iep_2024.pdf",
        sizeBytes: 100,
      },
    ],
    engine1Result: {
      domainLabel: "Special education records",
      domainResolutionStatus: "resolved",
      groups: [],
      documents: [
        {
          id: "doc-staged-1",
          stagedDocumentId: "staged-1",
          documentType: "IEP",
          title: "IEP",
          originalFilename: "iep_2024.pdf",
          sizeBytes: 100,
          familyRole: "plan",
          groupId: "planning",
          recognitionStatus: "recognized",
        },
      ],
      relationships: [],
      missingDocuments: [],
    },
    questionSet: {
      id: "qs-1",
      questions: [
        {
          id: "q1",
          prompt: "Required?",
          required: true,
          answerKind: "single_choice",
          affectsCanonicalTruth: true,
          affectsAnalysis: true,
          affectsProjection: true,
        },
      ],
    },
    answerSnapshot: {
      questionSetId: "qs-1",
      answers: {
        q1: {
          questionId: "q1",
          value: { choiceId: "a" },
          status: "answered",
          updatedAt: new Date().toISOString(),
        },
      },
      missingNodeStates: {},
      ambiguityNodeStates: {},
      analysisIntent: null,
      userContext: null,
    },
  };
}

/** Simulates Postgres unique (case_id, idempotency_key) when two runs use different ids. */
class PostgresLikeStudyRunRepository extends InMemoryStudyRunRepository {
  async save(run: CanonicalStudyRun): Promise<CanonicalStudyRun> {
    const existing = await this.getByIdempotencyKey(run.caseId, run.idempotencyKey);
    if (existing && existing.studyRunId !== run.studyRunId) {
      throw new Error(
        'duplicate key value violates unique constraint "study_runs_case_id_idempotency_key_key"',
      );
    }
    await super.save(run);
    return run;
  }
}

function createDeps(
  runRepo: StudyRunRepository,
  inFlight: Map<string, Promise<import("./run-canonical-study").CanonicalStudyOutcome>>,
): StudyServiceDeps {
  return {
    engine: new FixtureCanonicalStudyEngine(),
    providerId: "fixture-canonical-study-engine",
    providerMode: "fixture",
    contextRepo: new InMemoryStudyContextRepository(),
    runRepo,
    eventRepo: new InMemoryStudyRunEventRepository(),
    intelligenceRepo: new InMemoryCaseIntelligenceRepository(),
    prompt: loadCanonicalStudyPrompt("canonical-study-v3"),
    inFlight,
  };
}

describe("study run concurrency (postgres-like idempotency)", () => {
  it("surfaces the duplicate-key error when two executions race without shared in-flight dedupe", async () => {
    const runRepo = new PostgresLikeStudyRunRepository();
    const req = baseRequest();

    await expect(
      Promise.all([
        runCanonicalStudy(req, createDeps(runRepo, new Map())),
        runCanonicalStudy(req, createDeps(runRepo, new Map())),
      ]),
    ).rejects.toThrow(/study_runs_case_id_idempotency_key_key/);
  });

  it("runs one engine invocation and one run id when requests share in-flight dedupe", async () => {
    const runRepo = new PostgresLikeStudyRunRepository();
    const inFlight = new Map();
    const deps = createDeps(runRepo, inFlight);
    let engineCalls = 0;
    const fixture = new FixtureCanonicalStudyEngine();
    deps.engine = {
      study: async (ctx) => {
        engineCalls += 1;
        return fixture.study(ctx);
      },
    };
    const req = baseRequest();
    const [a, b] = await Promise.all([
      runCanonicalStudy(req, deps),
      runCanonicalStudy(req, deps),
    ]);
    expect(engineCalls).toBe(1);
    expect(a.run.studyRunId).toBe(b.run.studyRunId);
    expect(a.run.status).toBe("SUCCEEDED");
    expect(b.run.status).toBe("SUCCEEDED");
    expect(b.reusedExistingRun).toBe(true);
  });

  it("waits for a RUNNING run instead of invoking the engine again without shared in-flight", async () => {
    const runRepo = new InMemoryStudyRunRepository();
    let releaseEngine!: () => void;
    const engineGate = new Promise<void>((resolve) => {
      releaseEngine = resolve;
    });
    let engineCalls = 0;
    const deps = createDeps(runRepo, new Map());
    deps.engine = {
      study: async (ctx) => {
        engineCalls += 1;
        await engineGate;
        return new FixtureCanonicalStudyEngine().study(ctx);
      },
    };
    const req = baseRequest();
    const first = runCanonicalStudy(req, deps);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const secondPromise = runCanonicalStudy(req, { ...deps, inFlight: new Map() });
    releaseEngine();
    const [firstOutcome, second] = await Promise.all([first, secondPromise]);
    expect(engineCalls).toBe(1);
    expect(second.reusedExistingRun).toBe(true);
    expect(second.run.studyRunId).toBe(firstOutcome.run.studyRunId);
    expect(second.run.status).toBe("SUCCEEDED");
  });

  it("persists one intelligence version when concurrent requests race without shared in-flight", async () => {
    const runRepo = new InMemoryStudyRunRepository();
    const intel = new InMemoryCaseIntelligenceRepository();
    const inFlight = new Map();
    const deps = createDeps(runRepo, inFlight);
    deps.intelligenceRepo = intel;
    const req = baseRequest();
    await Promise.all([
      runCanonicalStudy(req, deps),
      runCanonicalStudy(req, { ...deps, inFlight: new Map() }),
    ]);
    expect(await intel.getLatestVersion(req.caseId)).toBe(1);
    const snap = await intel.getByVersion(req.caseId, 1);
    expect(snap?.version).toBe(1);
  });
});
