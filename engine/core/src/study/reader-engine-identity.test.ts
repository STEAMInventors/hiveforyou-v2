import { describe, expect, it } from "vitest";

import { PACK_DRIVEN_READER_PROMPT_VERSION } from "@hiveforyou/domain-pack/pack-driven-reader";

import {
  buildObservedReaderIdentitySummary,
  buildPackDrivenReaderIntentFingerprint,
  displayModelIdentityFromSummary,
  parseReaderPreflightFromAgentsHealth,
  READER_DELEGATED_PROVIDER_MODE,
  PACK_DRIVEN_READER_ORCHESTRATION_ID,
} from "./reader-engine-identity";
import { buildIdempotencyKeyFromRequest, studyEngineFingerprintFromDeps } from "./freeze-context";
import { resolveDomainPackFromDiscoveryLabel } from "@hiveforyou/domain-packs";
import type { StartCanonicalStudyRequest } from "@hiveforyou/shared/canonical-study";
import { loadCanonicalStudyPrompt } from "../prompts/load-canonical-study-prompt";

function minimalRequest(
  processingMode: "canonical_openai_v4" | "pack_driven_v1" = "canonical_openai_v4",
): StartCanonicalStudyRequest {
  return {
    caseId: "case-identity",
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

describe("reader-engine-identity", () => {
  it("builds pack-driven intent fingerprint without Worker model id", () => {
    const fingerprint = buildPackDrivenReaderIntentFingerprint({
      proposalPackContentSha256: "b".repeat(64),
    });
    expect(fingerprint.providerMode).toBe(READER_DELEGATED_PROVIDER_MODE);
    expect(fingerprint.providerId).toBe(PACK_DRIVEN_READER_ORCHESTRATION_ID);
    expect(fingerprint.modelId).toBeUndefined();
    expect(fingerprint.readerCompilerVersion).toBe(PACK_DRIVEN_READER_PROMPT_VERSION);
    expect(fingerprint.promptVersion).toBe("pack_driven_v1");
  });

  it("parses non-authoritative preflight from agents health", () => {
    const snapshot = parseReaderPreflightFromAgentsHealth(
      { status: "ok", modelProvider: "anthropic", modelName: "claude-opus-5-5" },
      "2026-10-12T12:00:00.000Z",
    );
    expect(snapshot).toEqual({
      modelProvider: "anthropic",
      modelName: "claude-opus-5-5",
      observedAt: "2026-10-12T12:00:00.000Z",
      source: "hive-agents/health",
    });
  });

  it("summarizes partial failures and mixed-model envelopes", () => {
    const summary = buildObservedReaderIdentitySummary({
      attemptId: "attempt-1",
      envelopes: [
        {
          modelProvider: "anthropic",
          modelId: "claude-a",
          status: "SUCCEEDED",
        },
        {
          modelProvider: "anthropic",
          modelId: "claude-b",
          status: "INVALID_JSON",
        },
      ],
    });
    expect(summary.documentCount).toBe(2);
    expect(summary.succeededDocumentCount).toBe(1);
    expect(summary.failedDocumentCount).toBe(1);
    expect(summary.distinctModelIds).toEqual(["claude-a", "claude-b"]);
    expect(displayModelIdentityFromSummary(summary, [])).toEqual({
      modelProvider: "anthropic",
      modelId: "claude-a, claude-b",
    });
  });

  it("isolates retry attempts by attemptId in observed summary", () => {
    const attemptOne = buildObservedReaderIdentitySummary({
      attemptId: "attempt-1",
      envelopes: [{ modelProvider: "anthropic", modelId: "claude-v1", status: "SUCCEEDED" }],
    });
    const attemptTwo = buildObservedReaderIdentitySummary({
      attemptId: "attempt-2",
      envelopes: [{ modelProvider: "anthropic", modelId: "claude-v2", status: "SUCCEEDED" }],
    });
    expect(attemptOne.attemptId).not.toBe(attemptTwo.attemptId);
    expect(attemptOne.distinctModelIds).not.toEqual(attemptTwo.distinctModelIds);
  });

  it("keeps v4 idempotency stable when readerCompilerVersion is absent", () => {
    const pack = resolveDomainPackFromDiscoveryLabel("Special education records")!;
    const request = minimalRequest("canonical_openai_v4");
    const prompt = loadCanonicalStudyPrompt("canonical-study-v4");
    const engine = studyEngineFingerprintFromDeps({
      providerMode: "openai",
      providerId: "openai-canonical-study-engine-v4",
      modelId: "gpt-5.6-sol",
      prompt,
    });
    const key = buildIdempotencyKeyFromRequest(request, pack, engine);
    const replay = buildIdempotencyKeyFromRequest(request, pack, engine);
    expect(replay).toBe(key);
    expect(engine.readerCompilerVersion).toBeUndefined();
  });

  it("changes pack-driven idempotency when readerCompilerVersion changes", () => {
    const pack = resolveDomainPackFromDiscoveryLabel("Special education records")!;
    const request = minimalRequest("pack_driven_v1");
    const base = buildPackDrivenReaderIntentFingerprint({
      proposalPackContentSha256: "c".repeat(64),
    });
    const bumped = { ...base, readerCompilerVersion: "hive-pack-driven-reader/0.3.0" };
    const baseKey = buildIdempotencyKeyFromRequest(request, pack, base);
    const bumpedKey = buildIdempotencyKeyFromRequest(request, pack, bumped);
    expect(baseKey).not.toBe(bumpedKey);
  });

  it("does not include Worker openai model in pack-driven idempotency material", () => {
    const pack = resolveDomainPackFromDiscoveryLabel("Special education records")!;
    const request = minimalRequest("pack_driven_v1");
    const intent = buildPackDrivenReaderIntentFingerprint({
      proposalPackContentSha256: "d".repeat(64),
    });
    const key = buildIdempotencyKeyFromRequest(request, pack, intent);
    const openAiEngine = studyEngineFingerprintFromDeps({
      providerMode: "openai",
      providerId: "openai-canonical-study-engine-v4",
      modelId: "gpt-5.6-sol",
      prompt: { version: "pack_driven_v1", sha256: "d".repeat(64) },
    });
    const wrongKey = buildIdempotencyKeyFromRequest(request, pack, openAiEngine);
    expect(key).not.toBe(wrongKey);
    expect(openAiEngine.modelId).toBe("gpt-5.6-sol");
    expect(intent.modelId).toBeUndefined();
  });
});
