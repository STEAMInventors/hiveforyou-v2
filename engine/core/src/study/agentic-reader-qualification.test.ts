import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildIdempotencyKeyFromRequest, studyEngineFingerprintFromDeps } from "./freeze-context";
import { loadCanonicalStudyPrompt } from "../prompts/load-canonical-study-prompt";
import { resolveDomainPackFromDiscoveryLabel } from "@hiveforyou/domain-packs";
import type { StartCanonicalStudyRequest } from "@hiveforyou/shared/canonical-study";

import {
  AGENTIC_READER_QUALIFICATION_QUESTION_SET_VERSION,
  buildAgenticReaderQualificationEngineFingerprint,
  buildAgenticReaderQualificationRun,
  buildL001QualificationSourceDocumentIdToFilename,
  computeAgenticReaderQualificationIdempotencyKey,
  defaultStudyAgentsJsonPath,
  fingerprintL001QualificationCorpus,
  L001_QUALIFICATION_SOURCE_SHA256,
  l001QualificationManifestPath,
  loadAgenticReaderQualificationPromptMetadata,
  loadEffectiveStudyAgentsPromptMetadata,
  loadL001QualificationManifest,
  loadReaderExperimentPromptHashes,
  parseAndValidateL001QualificationManifest,
  readerExperimentPromptHashesPath,
  resolveAgenticReaderModelIdentity,
  resolveEffectiveHiveAgentsModelIdentity,
  verifyL001QualificationManifestPackaged,
  verifyReaderExperimentPromptHashesPackaged,
} from "./agentic-reader-qualification";

const COMMITTED_READER_EXPERIMENT_PROMPT_HASHES = {
  promptVersion: "hive-reader-prompt/2.0.0",
  sharedPromptSha256: "f4f425e1a985c81661ab81a299a5bc0b6b97f679f1cae9ecc7cf4ba046304ca3",
  case_wide_sha256: "642db763812ef567d5bd24dfed65fefe87c238886616942d0d229f0d3d5a4c64",
  parallel_document_sha256: "6e97b881c1f310be1c80844813851849199e24827cbe7698542da58ea5033fce",
} as const;

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

  it("loads committed reader experiment prompt hashes from the repo tree", () => {
    const hashes = loadReaderExperimentPromptHashes({
      HIVE_READER_EXPERIMENT_PROMPT_HASHES_JSON: undefined,
    });
    expect(hashes).toEqual(COMMITTED_READER_EXPERIMENT_PROMPT_HASHES);
  });

  it("honors HIVE_READER_EXPERIMENT_PROMPT_HASHES_JSON like the Oracle worker image", () => {
    const repoPath = readerExperimentPromptHashesPath({});
    const env = { HIVE_READER_EXPERIMENT_PROMPT_HASHES_JSON: repoPath };
    expect(readerExperimentPromptHashesPath(env)).toBe(repoPath);
    expect(loadReaderExperimentPromptHashes(env)).toEqual(COMMITTED_READER_EXPERIMENT_PROMPT_HASHES);
    expect(() => verifyReaderExperimentPromptHashesPackaged(env)).not.toThrow();
  });

  it("does not require packaged experiment metadata when the env override is unset", () => {
    expect(() => verifyReaderExperimentPromptHashesPackaged({})).not.toThrow();
  });

  it("loads committed L001 qualification manifest from the repo tree", () => {
    const manifest = loadL001QualificationManifest({
      HIVE_L001_QUALIFICATION_MANIFEST_JSON: undefined,
    });
    expect(manifest.files).toHaveLength(L001_QUALIFICATION_SOURCE_SHA256.length);
  });

  it("honors HIVE_L001_QUALIFICATION_MANIFEST_JSON like the Oracle worker image", () => {
    const repoPath = l001QualificationManifestPath({});
    const env = { HIVE_L001_QUALIFICATION_MANIFEST_JSON: repoPath };
    expect(l001QualificationManifestPath(env)).toBe(repoPath);
    expect(loadL001QualificationManifest(env).files).toHaveLength(8);
    expect(() => verifyL001QualificationManifestPackaged(env)).not.toThrow();
  });

  it("does not require packaged L001 manifest when the env override is unset", () => {
    expect(() => verifyL001QualificationManifestPackaged({})).not.toThrow();
  });

  it("fail-closes on missing packaged L001 manifest path", () => {
    const dir = mkdtempSync(join(tmpdir(), "l001-manifest-"));
    const missingPath = join(dir, "missing-manifest.json");
    try {
      expect(() =>
        loadL001QualificationManifest({
          HIVE_L001_QUALIFICATION_MANIFEST_JSON: missingPath,
        }),
      ).toThrow(`L001_QUALIFICATION_MANIFEST_MISSING:${missingPath}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fail-closes on invalid L001 manifest pins", () => {
    const dir = mkdtempSync(join(tmpdir(), "l001-manifest-"));
    const manifestPath = join(dir, "manifest.json");
    try {
      writeFileSync(
        manifestPath,
        JSON.stringify({
          files: [{ filename: "only.pdf", sha256: "a".repeat(64) }],
        }),
        "utf8",
      );
      expect(() =>
        parseAndValidateL001QualificationManifest(readFileSync(manifestPath, "utf8"), manifestPath),
      ).toThrow(`L001_QUALIFICATION_MANIFEST_INVALID:${manifestPath}:files`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("maps all eight L001 registered documents to corpus filenames", () => {
    const registered = L001_QUALIFICATION_SOURCE_SHA256.map((sha256, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      sha256,
    }));
    const map = buildL001QualificationSourceDocumentIdToFilename(registered, {
      HIVE_L001_QUALIFICATION_MANIFEST_JSON: undefined,
    });
    expect(map.size).toBe(8);
    expect([...map.values()].every((name) => name.endsWith(".pdf"))).toBe(true);
  });

  it("uses experiment prompt hash metadata only when HIVE_READER_ARCHITECTURE_VARIANT is set", () => {
    const base = loadAgenticReaderQualificationPromptMetadata({
      env: { HIVE_READER_EXPERIMENT_PROMPT_HASHES_JSON: undefined },
    });
    const variantA = loadAgenticReaderQualificationPromptMetadata({
      env: {
        HIVE_READER_EXPERIMENT_PROMPT_HASHES_JSON: undefined,
        HIVE_READER_ARCHITECTURE_VARIANT: "case_wide",
      },
    });
    expect(base.promptSha256).not.toBe(variantA.promptSha256);
    expect(variantA.promptSha256).toBe(COMMITTED_READER_EXPERIMENT_PROMPT_HASHES.sharedPromptSha256);
    expect(variantA.promptId).toBe("reader-experiment/architecture/case_wide");
    expect(variantA.promptVersion).toBe("hive-reader-prompt/2.0.0+case_wide");
  });

  it("retires HIVE_READER_EXPERIMENT_VARIANT", () => {
    expect(() =>
      loadAgenticReaderQualificationPromptMetadata({
        env: { HIVE_READER_EXPERIMENT_VARIANT: "golden_inspired" },
      }),
    ).toThrow("READER_EXPERIMENT_VARIANT_RETIRED");
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
