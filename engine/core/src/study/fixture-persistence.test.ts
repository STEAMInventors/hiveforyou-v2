import { afterEach, describe, expect, it, vi } from "vitest";

import { InMemoryCaseIntelligenceRepository } from "@hiveforyou/canonical";
import {
  InMemoryCaseProjectionRepository,
  type CaseProjectionRepository,
} from "../persistence/case-projection-repository";

import {
  FixtureCanonicalStudyEngine,
  type CanonicalStudyEngine,
} from "./engine";
import { InMemoryStudyRunEventRepository } from "./event-repository";
import { loadCanonicalStudyPrompt } from "../prompts/load-canonical-study-prompt";
import {
  InMemoryStudyContextRepository,
  InMemoryStudyRunRepository,
} from "./repositories";
import { runCanonicalStudy, type StudyServiceDeps } from "./run-canonical-study";
import type { StartCanonicalStudyRequest } from "@hiveforyou/shared/canonical-study";

function baseRequest(): StartCanonicalStudyRequest {
  return {
    caseId: "case-fixture-guard",
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
      analysisIntent: { choiceIds: ["improving"] },
      userContext: null,
    },
  };
}

function createDeps(
  engine: CanonicalStudyEngine,
  mode: "fixture" | "openai",
  intelligenceRepo = new InMemoryCaseIntelligenceRepository(),
  projectionRepo?: CaseProjectionRepository,
): StudyServiceDeps {
  return {
    engine,
    providerId:
      mode === "fixture" ? "fixture-canonical-study-engine" : "openai-canonical-study-engine",
    providerMode: mode,
    modelId: mode === "fixture" ? "fixture-v1" : "gpt-test",
    contextRepo: new InMemoryStudyContextRepository(),
    runRepo: new InMemoryStudyRunRepository(),
    eventRepo: new InMemoryStudyRunEventRepository(),
    intelligenceRepo,
    projectionRepo,
    prompt: loadCanonicalStudyPrompt("canonical-study-v3"),
    inFlight: new Map(),
  };
}

class ProductionProposalEngine implements CanonicalStudyEngine {
  private readonly fixture = new FixtureCanonicalStudyEngine();

  async study(
    context: Parameters<CanonicalStudyEngine["study"]>[0],
    runtime?: Parameters<CanonicalStudyEngine["study"]>[1],
  ) {
    const base = await this.fixture.study(context, runtime);
    return {
      ...base,
      modelMetadata: {
        ...base.modelMetadata,
        providerId: "openai-canonical-study-engine",
        modelId: "gpt-test",
        proposalMode: "production" as const,
      },
    };
  }
}

describe("fixture persistence isolation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("blocks fixture intelligence persistence outside test mode", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const intel = new InMemoryCaseIntelligenceRepository();
    let projectionWrites = 0;
    const inner = new InMemoryCaseProjectionRepository();
    const projectionRepo: CaseProjectionRepository = {
      save: async (record) => {
        projectionWrites += 1;
        await inner.save(record);
      },
      getByVersionAndKind: (...args) => inner.getByVersionAndKind(...args),
    };
    const outcome = await runCanonicalStudy(
      baseRequest(),
      createDeps(new FixtureCanonicalStudyEngine(), "fixture", intel, projectionRepo),
    );
    expect(outcome.run.status).toBe("FAILED");
    expect(outcome.run.errorCode).toBe("FIXTURE_MODE_NOT_ALLOWED");
    expect(await intel.getLatestVersion("case-fixture-guard")).toBeNull();
    expect(projectionWrites).toBe(0);
  });

  it("allows fixture persistence in test mode", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const intel = new InMemoryCaseIntelligenceRepository();
    const outcome = await runCanonicalStudy(
      baseRequest(),
      createDeps(new FixtureCanonicalStudyEngine(), "fixture", intel),
    );
    expect(outcome.run.status).toBe("SUCCEEDED");
    expect(await intel.getLatestVersion("case-fixture-guard")).toBe(1);
  });

  it("reuses an existing openai run but not after switching from fixture", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const req = baseRequest();
    const fixtureOutcome = await runCanonicalStudy(
      req,
      createDeps(new FixtureCanonicalStudyEngine(), "fixture"),
    );
    expect(fixtureOutcome.run.status).toBe("SUCCEEDED");

    const openaiDeps = createDeps(new ProductionProposalEngine(), "openai");
    const openaiOutcome = await runCanonicalStudy(req, openaiDeps);
    expect(openaiOutcome.run.status).toBe("SUCCEEDED");
    expect(openaiOutcome.run.studyRunId).not.toBe(fixtureOutcome.run.studyRunId);

    let calls = 0;
    const wrapped: CanonicalStudyEngine = {
      study: async (ctx, runtime) => {
        calls += 1;
        return openaiDeps.engine.study(ctx, runtime);
      },
    };
    openaiDeps.engine = wrapped;
    const reused = await runCanonicalStudy(req, openaiDeps);
    expect(reused.reusedExistingRun).toBe(true);
    expect(calls).toBe(0);
  });
});
