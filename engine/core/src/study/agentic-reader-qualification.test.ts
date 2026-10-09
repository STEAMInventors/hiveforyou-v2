import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buildIdempotencyKeyFromRequest, studyEngineFingerprintFromDeps } from "./freeze-context";
import { loadCanonicalStudyPrompt } from "../prompts/load-canonical-study-prompt";
import { resolveDomainPackFromDiscoveryLabel } from "@hiveforyou/domain-packs";
import type { StartCanonicalStudyRequest } from "@hiveforyou/shared/canonical-study";

import {
  AGENTIC_READER_QUALIFICATION_QUESTION_SET_VERSION,
  buildAgenticReaderQualificationEngineFingerprint,
  buildAgenticReaderQualificationRun,
  computeAgenticReaderQualificationIdempotencyKey,
  defaultStudyAgentsJsonPath,
  fingerprintL001QualificationCorpus,
  loadEffectiveStudyAgentsPromptMetadata,
  resolveAgenticReaderModelIdentity,
  resolveEffectiveHiveAgentsModelIdentity,
} from "./agentic-reader-qualification";

function oracleReaderQualificationModelEnv(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    MODEL_PROVIDER: "openai",
    MODEL_NAME: "gpt-5.6-sol",
    HIVE_AGENTS_CONFIG_MODEL_PROVIDER: "anthropic",
    HIVE_AGENTS_CONFIG_MODEL_NAME: "claude-opus-5-5",
    HIVE_AGENTS_DOCKER_COMPOSE_MODEL_PROVIDER: "anthropic",
    HIVE_AGENTS_DOCKER_COMPOSE_MODEL_NAME: "claude-opus-5-5",
    HIVE_AGENTS_MODEL_PROVIDER: "anthropic",
    HIVE_AGENTS_MODEL_NAME: "claude-opus-5-5",
    ...overrides,
  };
}

function minimalStudyRequest(): StartCanonicalStudyRequest {
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

describe("agentic reader qualification", () => {
  it("fingerprints L001 corpus deterministically", () => {
    const a = fingerprintL001QualificationCorpus();
    const b = fingerprintL001QualificationCorpus();
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(a).toBe(b);
  });

  it("uses a qualification namespace idempotency key distinct from canonical v4", () => {
    const prompt = loadEffectiveStudyAgentsPromptMetadata({
      agentsJsonPath: defaultStudyAgentsJsonPath("iep"),
    });
    const model = resolveAgenticReaderModelIdentity(oracleReaderQualificationModelEnv());
    const engine = buildAgenticReaderQualificationEngineFingerprint({
      promptSha256: prompt.promptSha256,
      modelIdentity: model,
    });
    const qualificationKey = computeAgenticReaderQualificationIdempotencyKey({
      caseId: "case-1",
      domainId: prompt.artifact.domainId,
      domainPackId: prompt.artifact.domainPackId,
      domainPackVersion: prompt.artifact.domainPackVersion,
      documentFingerprint: fingerprintL001QualificationCorpus(),
      engine,
    });

    const pack = resolveDomainPackFromDiscoveryLabel("Special education records")!;
    const v4Key = buildIdempotencyKeyFromRequest(
      minimalStudyRequest(),
      pack,
      studyEngineFingerprintFromDeps({
        providerMode: "openai",
        providerId: "openai-canonical-study-engine-v4",
        modelId: "gpt-test",
        prompt: loadCanonicalStudyPrompt("canonical-study-v4"),
      }),
    );

    expect(qualificationKey).not.toBe(v4Key);
    expect(
      computeAgenticReaderQualificationIdempotencyKey({
        caseId: "case-1",
        domainId: prompt.artifact.domainId,
        domainPackId: prompt.artifact.domainPackId,
        domainPackVersion: prompt.artifact.domainPackVersion,
        documentFingerprint: fingerprintL001QualificationCorpus(),
        engine,
      }),
    ).toBe(qualificationKey);
  });

  it("derives mandatory prompt metadata from the effective agents.json bytes", () => {
    const path = defaultStudyAgentsJsonPath("iep");
    const raw = readFileSync(path, "utf8");
    const meta = loadEffectiveStudyAgentsPromptMetadata({ agentsJsonPath: path });
    expect(meta.promptId).toBe("study-agents/iep/reader");
    expect(meta.promptVersion).toContain("study-agents/1");
    expect(meta.promptSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(meta.promptSha256).toBe(
      loadEffectiveStudyAgentsPromptMetadata({ agentsJsonPath: path }).promptSha256,
    );
    expect(raw.includes("study-agents/1")).toBe(true);
    expect(meta.artifact.agents.reader.trim().length).toBeGreaterThan(40);
  });

  it("records anthropic Reader identity when worker v4 defaults to openai", () => {
    const model = resolveAgenticReaderModelIdentity(oracleReaderQualificationModelEnv());
    expect(model.modelProvider).toBe("anthropic");
    expect(model.modelName).toBe("claude-opus-5-5");
    expect(model.providerId).toBe("hive-agents-anthropic");
  });

  it("fail-closes when qualification Reader identity is missing or mismatched", () => {
    expect(() =>
      resolveAgenticReaderModelIdentity(
        oracleReaderQualificationModelEnv({
          HIVE_AGENTS_MODEL_PROVIDER: undefined,
        }),
      ),
    ).toThrow("READER_MODEL_IDENTITY_UNCONFIGURED");

    expect(() =>
      resolveAgenticReaderModelIdentity(
        oracleReaderQualificationModelEnv({
          HIVE_AGENTS_MODEL_PROVIDER: "openai",
          HIVE_AGENTS_MODEL_NAME: "gpt-5.6-sol",
        }),
      ),
    ).toThrow("READER_MODEL_IDENTITY_MISMATCH");
  });

  it("resolveEffectiveHiveAgentsModelIdentity honors docker-compose overrides over agents.config", () => {
    const effective = resolveEffectiveHiveAgentsModelIdentity({
      HIVE_AGENTS_CONFIG_MODEL_PROVIDER: "anthropic",
      HIVE_AGENTS_CONFIG_MODEL_NAME: "claude-opus-5-5",
      HIVE_AGENTS_CONTAINER_MODEL_PROVIDER: "openai",
      HIVE_AGENTS_CONTAINER_MODEL_NAME: "gpt-5.6-sol",
      HIVE_AGENTS_DOCKER_COMPOSE_MODEL_PROVIDER: "anthropic",
      HIVE_AGENTS_DOCKER_COMPOSE_MODEL_NAME: "claude-opus-5-5",
    });
    expect(effective).toEqual({
      modelProvider: "anthropic",
      modelName: "claude-opus-5-5",
    });
  });

  it("builds a qualification run with anthropic provider mode when configured", () => {
    const prompt = loadEffectiveStudyAgentsPromptMetadata({
      agentsJsonPath: defaultStudyAgentsJsonPath("iep"),
    });
    const model = resolveAgenticReaderModelIdentity(oracleReaderQualificationModelEnv());
    const run = buildAgenticReaderQualificationRun({
      caseId: "44444444-4444-4444-8444-444444444444",
      idempotencyKey: "qual-key",
      artifact: prompt.artifact,
      prompt,
      modelIdentity: model,
    });
    expect(run.providerMode).toBe("anthropic");
    expect(run.providerId).toBe("hive-agents-anthropic");
    expect(run.promptId).toBe(prompt.promptId);
    expect(run.promptSha256).toBe(prompt.promptSha256);
    expect(run.questionSetVersion).toBe(AGENTIC_READER_QUALIFICATION_QUESTION_SET_VERSION);
  });
});
