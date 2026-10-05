import { describe, expect, it } from "vitest";

import { InMemoryCaseIntelligenceRepository } from "@hiveforyou/canonical";

import {
  createCanonicalStudyEngineFromEnv,
  FixtureCanonicalStudyEngine,
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
    caseId: "case-test-1",
    sourceDocuments: [
      {
        stagedDocumentId: "staged-1",
        discoveryDocumentId: "doc-staged-1",
        originalFilename: "iep_2024.pdf",
        sizeBytes: 100,
        storageBucket: "case-documents",
        storagePath: "user/case/staged-1/iep_2024.pdf",
        sha256: "abc",
        sourceDocumentId: "staged-1",
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
    answerSnapshotId: "snap-1",
  };
}

function createDeps(prompt = loadCanonicalStudyPrompt("canonical-study-v3")): StudyServiceDeps {
  return {
    engine: new FixtureCanonicalStudyEngine(),
    providerId: "fixture-canonical-study-engine",
    providerMode: "fixture",
    modelId: "fixture-v1",
    contextRepo: new InMemoryStudyContextRepository(),
    runRepo: new InMemoryStudyRunRepository(),
    eventRepo: new InMemoryStudyRunEventRepository(),
    intelligenceRepo: new InMemoryCaseIntelligenceRepository(),
    prompt,
    inFlight: new Map(),
  };
}

describe("persisted canonical study execution", () => {
  it("keeps the study context immutable after creation", async () => {
    const deps = createDeps();
    const outcome = await runCanonicalStudy(baseRequest(), deps);
    const frozen = await deps.contextRepo.getByStudyRunId(outcome.run.studyRunId);
    expect(frozen?.answerSnapshotId).toBe("snap-1");
    await expect(
      deps.contextRepo.save({
        ...frozen!,
        domainLabel: "changed",
      }),
    ).rejects.toThrow(/STUDY_CONTEXT_IMMUTABLE/);
    const reread = await deps.contextRepo.getByStudyRunId(outcome.run.studyRunId);
    expect(reread?.domainLabel).toBe("Special education records");
  });

  it("records prompt id, version, and hash on the study run", async () => {
    const prompt = loadCanonicalStudyPrompt("canonical-study-v3");
    const deps = createDeps(prompt);
    const outcome = await runCanonicalStudy(baseRequest(), deps);
    expect(outcome.run.promptId).toBe("canonical-study");
    expect(outcome.run.promptVersion).toBe("v3");
    expect(outcome.run.promptSha256).toBe(prompt.sha256);
    expect(outcome.run.promptVersion).not.toBe("latest");
    const context = await deps.contextRepo.getByStudyRunId(outcome.run.studyRunId);
    expect(context?.processingPolicy.promptSha256).toBe(prompt.sha256);
    const events = await deps.eventRepo.listByStudyRunId(outcome.run.studyRunId);
    expect(events[0]?.payload).toMatchObject({
      promptId: "canonical-study",
      promptVersion: "v3",
      promptSha256: prompt.sha256,
    });
  });

  it("creates a new case intelligence version instead of overwriting", async () => {
    const deps = createDeps();
    const first = await runCanonicalStudy(baseRequest(), deps);
    expect(first.run.caseIntelligenceVersion).toBe(1);
    const secondRequest = baseRequest();
    secondRequest.answerSnapshot = {
      ...secondRequest.answerSnapshot,
      answers: {
        q1: {
          questionId: "q1",
          value: { choiceId: "b" },
          status: "answered",
          updatedAt: new Date().toISOString(),
        },
      },
    };
    const second = await runCanonicalStudy(secondRequest, deps);
    expect(second.run.caseIntelligenceVersion).toBe(2);
    expect(second.run.studyRunId).not.toBe(first.run.studyRunId);
    const v1 = await deps.intelligenceRepo.getByVersion("case-test-1", 1);
    const v2 = await deps.intelligenceRepo.getByVersion("case-test-1", 2);
    expect(v1?.studyRunId).toBe(first.run.studyRunId);
    expect(v2?.studyRunId).toBe(second.run.studyRunId);
    await expect(
      deps.intelligenceRepo.save({ ...v1!, version: 1 }),
    ).rejects.toThrow(/CASE_INTELLIGENCE_VERSION_EXISTS/);
  });

  it("links the run to the same case, context, and intelligence version", async () => {
    const deps = createDeps();
    const outcome = await runCanonicalStudy(baseRequest(), deps);
    const context = await deps.contextRepo.getByStudyRunId(outcome.run.studyRunId);
    const snapshot = await deps.intelligenceRepo.getByVersion(
      outcome.run.caseId,
      outcome.run.caseIntelligenceVersion!,
    );
    const events = await deps.eventRepo.listByStudyRunId(outcome.run.studyRunId);
    expect(context?.caseId).toBe(outcome.run.caseId);
    expect(context?.studyRunId).toBe(outcome.run.studyRunId);
    expect(outcome.run.studyContextId).toBe(outcome.run.studyRunId);
    expect(snapshot?.caseId).toBe(outcome.run.caseId);
    expect(snapshot?.studyRunId).toBe(outcome.run.studyRunId);
    expect(events.every((event) => event.studyRunId === outcome.run.studyRunId)).toBe(true);
    expect(events.every((event) => event.caseId === outcome.run.caseId)).toBe(true);
  });

  it("keeps the fixture provider explicitly configured", () => {
    expect(createCanonicalStudyEngineFromEnv("fixture").mode).toBe("fixture");
    expect(createCanonicalStudyEngineFromEnv(undefined).mode).toBe("unconfigured");
    expect(createCanonicalStudyEngineFromEnv("").mode).toBe("unconfigured");
    expect(createCanonicalStudyEngineFromEnv("production").mode).toBe("unconfigured");
    expect(
      createCanonicalStudyEngineFromEnv(undefined, {
        callModel: async () => ({ outputText: "{}" }),
        modelName: "gpt-test",
      }).mode,
    ).toBe("openai");
  });
});
