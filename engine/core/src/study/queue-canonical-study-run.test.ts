import { describe, expect, it } from "vitest";

import { resolveDomainPackFromDiscoveryLabel } from "@hiveforyou/domain-packs";
import type { StartCanonicalStudyRequest } from "@hiveforyou/shared/canonical-study";

import { loadCanonicalStudyPrompt } from "../prompts/load-canonical-study-prompt";
import {
  PACK_DRIVEN_READER_ORCHESTRATION_ID,
  READER_DELEGATED_PROVIDER_MODE,
} from "./reader-engine-identity";
import { queueCanonicalStudyRun } from "./queue-canonical-study-run";
import type { StudyServiceDeps } from "./run-canonical-study";
import { InMemoryStudyRunRepository } from "./repositories";

function baseRequest(processingMode: "canonical_openai_v4" | "pack_driven_v1"): StartCanonicalStudyRequest {
  return {
    caseId: "case-queue",
    processingMode,
    sourceDocuments: [
      {
        stagedDocumentId: "staged-1",
        discoveryDocumentId: "doc-1",
        originalFilename: "a.pdf",
        sizeBytes: 1,
      },
    ],
    engine1Result: {
      domainLabel: "Special education records",
      domainResolutionStatus: "resolved",
      groups: [],
      documents: [
        {
          id: "doc-1",
          stagedDocumentId: "staged-1",
          documentType: "IEP",
          title: "IEP",
          originalFilename: "a.pdf",
          sizeBytes: 1,
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
          updatedAt: "2024-01-01T00:00:00.000Z",
        },
      },
      missingNodeStates: {},
      ambiguityNodeStates: {},
      analysisIntent: { choiceIds: ["improving"] },
      userContext: null,
    },
  };
}

describe("queueCanonicalStudyRun pack-driven metadata", () => {
  it("queues pack-driven runs with reader_delegated provider metadata", async () => {
    const runRepo = new InMemoryStudyRunRepository();
    const prompt = loadCanonicalStudyPrompt("canonical-study-v4");
    const deps = {
      engine: {} as StudyServiceDeps["engine"],
      providerId: "openai-canonical-study-engine-v4",
      providerMode: "openai",
      modelId: "gpt-5.6-sol",
      prompt,
      contextRepo: {} as StudyServiceDeps["contextRepo"],
      runRepo,
      eventRepo: {
        append: async () => undefined,
      } as StudyServiceDeps["eventRepo"],
      intelligenceRepo: {} as StudyServiceDeps["intelligenceRepo"],
    } satisfies StudyServiceDeps;

    const outcome = await queueCanonicalStudyRun(baseRequest("pack_driven_v1"), deps, {
      studyRunId: "11111111-1111-4111-8111-111111111111",
    });

    expect(outcome.run.providerMode).toBe(READER_DELEGATED_PROVIDER_MODE);
    expect(outcome.run.providerId).toBe(PACK_DRIVEN_READER_ORCHESTRATION_ID);
    expect(outcome.run.promptId).toBe("pack-driven-reader");
    expect(resolveDomainPackFromDiscoveryLabel("Special education records")?.domainId).toBe("iep");
  });

  it("queues v4 runs with Worker provider metadata unchanged", async () => {
    const runRepo = new InMemoryStudyRunRepository();
    const prompt = loadCanonicalStudyPrompt("canonical-study-v4");
    const deps = {
      engine: {} as StudyServiceDeps["engine"],
      providerId: "openai-canonical-study-engine-v4",
      providerMode: "openai",
      modelId: "gpt-5.6-sol",
      prompt,
      contextRepo: {} as StudyServiceDeps["contextRepo"],
      runRepo,
      eventRepo: {
        append: async () => undefined,
      } as StudyServiceDeps["eventRepo"],
      intelligenceRepo: {} as StudyServiceDeps["intelligenceRepo"],
    } satisfies StudyServiceDeps;

    const outcome = await queueCanonicalStudyRun(baseRequest("canonical_openai_v4"), deps, {
      studyRunId: "22222222-2222-4222-8222-222222222222",
    });

    expect(outcome.run.providerMode).toBe("openai");
    expect(outcome.run.providerId).toBe("openai-canonical-study-engine-v4");
  });
});
