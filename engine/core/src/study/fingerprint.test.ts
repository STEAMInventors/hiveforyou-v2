import { describe, expect, it } from "vitest";

import { resolveDomainPackFromDiscoveryLabel } from "@hiveforyou/domain-packs";
import type { StartCanonicalStudyRequest } from "@hiveforyou/shared/canonical-study";

import {
  buildIdempotencyKeyFromRequest,
  studyEngineFingerprintFromDeps,
} from "./freeze-context";
import { loadCanonicalStudyPrompt } from "../prompts/load-canonical-study-prompt";

function baseRequest(): StartCanonicalStudyRequest {
  return {
    caseId: "case-idempotency",
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

describe("study idempotency fingerprint", () => {
  const pack = resolveDomainPackFromDiscoveryLabel("Special education records")!;
  const request = baseRequest();
  const prompt = loadCanonicalStudyPrompt("canonical-study-v3");

  it("changes when switching fixture to openai", () => {
    const fixtureKey = buildIdempotencyKeyFromRequest(
      request,
      pack,
      studyEngineFingerprintFromDeps({
        providerMode: "fixture",
        providerId: "fixture-canonical-study-engine-v3",
        modelId: "fixture-v3",
        prompt,
      }),
    );
    const openaiKey = buildIdempotencyKeyFromRequest(
      request,
      pack,
      studyEngineFingerprintFromDeps({
        providerMode: "openai",
        providerId: "openai-canonical-study-engine-v3",
        modelId: "gpt-test",
        prompt,
      }),
    );
    expect(fixtureKey).not.toBe(openaiKey);
  });

  it("changes when prompt version changes", () => {
    const legacyKey = buildIdempotencyKeyFromRequest(
      request,
      pack,
      studyEngineFingerprintFromDeps({
        providerMode: "openai",
        providerId: "openai-canonical-study-engine-v3",
        modelId: "gpt-test",
        prompt: loadCanonicalStudyPrompt("canonical-study-v1"),
      }),
    );
    const currentKey = buildIdempotencyKeyFromRequest(
      request,
      pack,
      studyEngineFingerprintFromDeps({
        providerMode: "openai",
        providerId: "openai-canonical-study-engine-v3",
        modelId: "gpt-test",
        prompt,
      }),
    );
    expect(legacyKey).not.toBe(currentKey);
  });

  it("is stable for the same engine config and evidence", () => {
    const engine = studyEngineFingerprintFromDeps({
      providerMode: "openai",
      providerId: "openai-canonical-study-engine-v3",
      modelId: "gpt-test",
      prompt,
    });
    const a = buildIdempotencyKeyFromRequest(request, pack, engine);
    const b = buildIdempotencyKeyFromRequest(request, pack, engine);
    expect(a).toBe(b);
  });
});
