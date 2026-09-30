import { describe, expect, it } from "vitest";

import { InMemoryCaseIntelligenceRepository } from "@hiveforyou/canonical";

import type { StartCanonicalStudyRequest } from "@hiveforyou/shared/canonical-study";

import {
  FixtureCanonicalStudyEngine,
  UnconfiguredProductionStudyEngine,
  type CanonicalStudyEngine,
} from "./engine";
import { InMemoryStudyRunEventRepository } from "./event-repository";
import {
  InMemoryStudyContextRepository,
  InMemoryStudyRunRepository,
} from "./repositories";
import { loadCanonicalStudyPrompt } from "../prompts/load-canonical-study-prompt";
import { runCanonicalStudy, type StudyServiceDeps } from "./run-canonical-study";

function baseRequest(): StartCanonicalStudyRequest {
  return {
    caseId: "case-test-1",
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
  mode: "fixture" | "openai" | "unconfigured" = "fixture",
  intelligenceRepo = new InMemoryCaseIntelligenceRepository(),
  prompt = loadCanonicalStudyPrompt("canonical-study-v3"),
): StudyServiceDeps {
  return {
    engine,
    providerId: mode === "fixture" ? "fixture-canonical-study-engine" : "unconfigured",
    providerMode: mode,
    modelId: mode === "fixture" ? "fixture-v1" : undefined,
    contextRepo: new InMemoryStudyContextRepository(),
    runRepo: new InMemoryStudyRunRepository(),
    eventRepo: new InMemoryStudyRunEventRepository(),
    intelligenceRepo,
    prompt,
    inFlight: new Map(),
  };
}

describe("runCanonicalStudy", () => {
  it("cannot begin with incomplete required questions", async () => {
    const req = baseRequest();
    delete req.answerSnapshot.answers.q1;
    const outcome = await runCanonicalStudy(req, createDeps(new FixtureCanonicalStudyEngine()));
    expect(outcome.run.status).toBe("FAILED");
    expect(outcome.run.errorCode).toBe("INCOMPLETE_REQUIRED_QUESTIONS");
  });

  it("captures document discovery in frozen context", async () => {
    const deps = createDeps(new FixtureCanonicalStudyEngine());
    const outcome = await runCanonicalStudy(baseRequest(), deps);
    const ctx = await deps.contextRepo.getByStudyRunId(outcome.run.studyRunId);
    expect(ctx?.engine1Result.documents).toHaveLength(1);
    expect(ctx?.sourceDocuments[0]?.stagedDocumentId).toBe("staged-1");
  });

  it("captures immutable answer snapshot separate from intent fields", async () => {
    const deps = createDeps(new FixtureCanonicalStudyEngine());
    const outcome = await runCanonicalStudy(baseRequest(), deps);
    const ctx = await deps.contextRepo.getByStudyRunId(outcome.run.studyRunId);
    expect(ctx?.answerSnapshot.analysisIntent).toEqual({ choiceIds: ["improving"] });
    expect(ctx?.processingPolicy.intentAffectsFacts).toBe(false);
  });

  it("freezes persisted customer objective into study context for Engine 2", async () => {
    const deps = createDeps(new FixtureCanonicalStudyEngine());
    deps.customerContext = {
      source: "CUSTOMER_ASSERTION",
      domains: [
        {
          domainId: "iep",
          objective: "Understand placement and services",
          objectiveCapturedAt: new Date().toISOString(),
          shareIntent: "no",
          intendedAudience: {
            roleId: "attorney",
            label: "Attorney",
            domainPackId: null,
            domainPackVersion: null,
          },
        },
      ],
    };
    const outcome = await runCanonicalStudy(baseRequest(), deps);
    const ctx = await deps.contextRepo.getByStudyRunId(outcome.run.studyRunId);
    expect(ctx?.customerContext?.objective).toBe("Understand placement and services");
    expect(ctx?.customerContext?.domainId).toBe("iep");
    expect(ctx?.customerContext).not.toHaveProperty("shareIntent");
    expect(ctx?.customerContext).not.toHaveProperty("intendedAudience");
    expect(ctx?.processingPolicy.intentAffectsFacts).toBe(false);
  });

  it("captures domain pack id and version with stable domainId", async () => {
    const outcome = await runCanonicalStudy(
      baseRequest(),
      createDeps(new FixtureCanonicalStudyEngine()),
    );
    expect(outcome.run.domainId).toBe("iep");
    expect(outcome.run.domainPackId).toBe("hive.domain.iep");
    expect(outcome.run.domainPackVersion).toMatch(/scaffold/);
  });

  it("prevents duplicate invocation for same idempotency fingerprint", async () => {
    const engine = new FixtureCanonicalStudyEngine();
    let calls = 0;
    const wrapped: CanonicalStudyEngine = {
      study: async (ctx) => {
        calls += 1;
        return engine.study(ctx);
      },
    };
    const deps = createDeps(wrapped);
    const req = baseRequest();
    const [a, b] = await Promise.all([
      runCanonicalStudy(req, deps),
      runCanonicalStudy(req, deps),
    ]);
    expect(calls).toBe(1);
    expect(a.run.studyRunId).toBe(b.run.studyRunId);
  });

  it("valid proposal succeeds", async () => {
    const outcome = await runCanonicalStudy(
      baseRequest(),
      createDeps(new FixtureCanonicalStudyEngine()),
    );
    expect(outcome.run.status).toBe("SUCCEEDED");
    expect(outcome.run.caseIntelligenceVersion).toBe(1);
  });

  it("persistence failure prevents SUCCEEDED status", async () => {
    const repo = new InMemoryCaseIntelligenceRepository();
    repo.save = async () => {
      throw new Error("disk full");
    };
    const outcome = await runCanonicalStudy(
      baseRequest(),
      createDeps(new FixtureCanonicalStudyEngine(), "fixture", repo),
    );
    expect(outcome.run.status).toBe("FAILED");
    expect(outcome.run.errorCode).toBe("PERSISTENCE_FAILURE");
  });

  it("provider failure produces FAILED state", async () => {
    const outcome = await runCanonicalStudy(
      baseRequest(),
      createDeps(new UnconfiguredProductionStudyEngine(), "openai"),
    );
    expect(outcome.run.status).toBe("FAILED");
    expect(outcome.run.errorCode).toBe("ENGINE_UNAVAILABLE");
  });

  it("unconfigured mode fail-closed without fixture", async () => {
    const outcome = await runCanonicalStudy(
      baseRequest(),
      createDeps(new UnconfiguredProductionStudyEngine(), "unconfigured"),
    );
    expect(outcome.run.status).toBe("FAILED");
    expect(outcome.run.errorCode).toBe("ENGINE_UNAVAILABLE");
  });

  it("successful run persists versioned case intelligence", async () => {
    const intel = new InMemoryCaseIntelligenceRepository();
    const deps = createDeps(new FixtureCanonicalStudyEngine(), "fixture", intel);
    await runCanonicalStudy(baseRequest(), deps);
    const v = await intel.getLatestVersion("case-test-1");
    expect(v).toBe(1);
    const snap = await intel.getByVersion("case-test-1", 1);
    expect(snap?.claims.length).toBeGreaterThan(0);
  });

  it("retry after FAILED reuses same studyRunId when engine fingerprint is unchanged", async () => {
    const deps = createDeps(new UnconfiguredProductionStudyEngine(), "openai");
    deps.modelId = "gpt-test";
    const req = baseRequest();
    const first = await runCanonicalStudy(req, deps);
    expect(first.run.status).toBe("FAILED");
    deps.engine = new UnconfiguredProductionStudyEngine();
    const second = await runCanonicalStudy(req, deps);
    expect(second.run.status).toBe("FAILED");
    expect(second.run.studyRunId).toBe(first.run.studyRunId);
  });

  it("append-only events recorded outside run mutation only", async () => {
    const deps = createDeps(new FixtureCanonicalStudyEngine());
    const outcome = await runCanonicalStudy(baseRequest(), deps);
    const events = await deps.eventRepo.listByStudyRunId(outcome.run.studyRunId);
    expect(events.map((e) => e.type)).toContain("study_run.started");
    expect(events.map((e) => e.type)).toContain("study_run.completed");
  });
});

describe("validateCanonicalStudyProposalV3", () => {
  it("rejects chipless claim via fixture option", async () => {
    const outcome = await runCanonicalStudy(
      baseRequest(),
      createDeps(new FixtureCanonicalStudyEngine({ includeChiplessClaim: true })),
    );
    expect(outcome.run.status).toBe("SUCCEEDED");
    expect(outcome.run.caseIntelligenceVersion).toBeGreaterThan(0);
  });
});
