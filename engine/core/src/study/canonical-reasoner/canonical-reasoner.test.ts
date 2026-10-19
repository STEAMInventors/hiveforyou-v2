import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  compileDeclarativeCanonicalReasonerContext,
  defaultDeclarativePackRepoRoot,
  hashCompiledCanonicalReasonerContext,
  loadDeclarativePackFromRoot,
} from "@hiveforyou/domain-packs/declarative";
import type { CallModel } from "@hiveforyou/shared/model/call-model";
import { ModelCallError } from "@hiveforyou/shared/model/call-model";
import {
  CANONICAL_STUDY_REASONER_PROPOSAL_SCHEMA_VERSION,
  OBSERVATION_SNAPSHOT_SCHEMA_VERSION,
  type ObservationSnapshot,
} from "@hiveforyou/shared/canonical-study-graph";

import { buildCanonicalReasonerUserContext, buildCanonicalReasonerUserMessage } from "./build-reasoner-context.js";
import { createCanonicalReasonerFromEnv } from "./create-canonical-reasoner-from-env.js";
import { FixtureCanonicalReasoner } from "./fixture-canonical-reasoner.js";
import { canonicalReasonerPromptSha256 } from "./prompt-metadata.js";
import { ProductionCanonicalReasoner } from "./production-canonical-reasoner.js";
import { CanonicalReasonerUnavailableError, MalformedCanonicalReasonerProposalError } from "./reasoner-errors.js";
import { validateReasonerProposalStructure } from "./validate-proposal-references.js";

const digest = "a".repeat(64);

function iepPackContext() {
  const iepRoot = join(defaultDeclarativePackRepoRoot(), "engine/domain-packs/iep/v0.2.1");
  const packContext = compileDeclarativeCanonicalReasonerContext(loadDeclarativePackFromRoot(iepRoot));
  return { iepRoot, packContext, packSha: hashCompiledCanonicalReasonerContext(packContext) };
}

function minimalSnapshot(): ObservationSnapshot {
  return {
    schemaVersion: OBSERVATION_SNAPSHOT_SCHEMA_VERSION,
    studyRunId: "run-1",
    attemptId: "attempt-1",
    caseId: "case-1",
    domainId: "synthetic-declarative",
    packPin: {
      packId: "synthetic-declarative",
      packVersion: "0.1.0",
      packContentSha256: digest,
    },
    source: {
      schemaVersion: "reader-accepted-facts/1",
      studyRunId: "run-1",
      attemptId: "attempt-1",
      promptSha256: digest,
    },
    createdAt: "2026-10-18T00:00:00.000Z",
    contentDigest: digest,
    observations: [
      {
        id: "obs-1",
        readerFactId: "fact-1",
        predicateTypeId: "entity.name",
        value: { kind: "text", text: "River" },
        role: "observed",
        evidenceRefs: [{ sourceDocumentId: "doc-a", page: 1, snippet: "River" }],
        verificationStatus: "verified",
      },
      {
        id: "obs-2",
        readerFactId: "fact-2",
        predicateTypeId: "entity.name",
        value: { kind: "text", text: "Delta" },
        role: "observed",
        evidenceRefs: [{ sourceDocumentId: "doc-b", page: 2, snippet: "Delta" }],
        verificationStatus: "verified",
      },
    ],
  };
}

function iepPackPin(packContext: ReturnType<typeof compileDeclarativeCanonicalReasonerContext>) {
  return {
    packId: packContext.packId,
    packVersion: packContext.packVersion,
    packContentSha256: digest,
  };
}

describe("canonical reasoner", () => {
  it("builds deterministic user context ordering", () => {
    const snapshot = minimalSnapshot();
    snapshot.observations = [snapshot.observations[1]!, snapshot.observations[0]!];
    const { packContext, packSha } = iepPackContext();
    const ctx = buildCanonicalReasonerUserContext({
      studyRunId: snapshot.studyRunId,
      attemptId: snapshot.attemptId,
      caseId: snapshot.caseId,
      domainId: snapshot.domainId,
      packPin: snapshot.packPin,
      compiledPackContextSha256: packSha,
      observationSnapshot: snapshot,
    });
    expect(ctx.observations.map((obs) => obs.id)).toEqual(["obs-1", "obs-2"]);
    const messageA = buildCanonicalReasonerUserMessage({ packContext, userContext: ctx });
    const messageB = buildCanonicalReasonerUserMessage({ packContext, userContext: ctx });
    expect(messageA).toBe(messageB);
    expect(canonicalReasonerPromptSha256()).toHaveLength(64);
  });

  it("rejects fabricated observation references after schema merge", () => {
    const snapshot = minimalSnapshot();
    const raw = {
      schemaVersion: CANONICAL_STUDY_REASONER_PROPOSAL_SCHEMA_VERSION,
      studyRunId: "run-1",
      attemptId: "attempt-1",
      packPin: snapshot.packPin,
      modelPin: {
        providerId: "test",
        modelId: "test",
        promptId: "canonical-reasoner",
        promptVersion: "1.0.0",
        promptSha256: digest,
      },
      observables: [
        {
          id: "ob-1",
          typeId: "person.student",
          label: "Student",
          identityStatus: "resolved",
          observationIds: ["obs-fabricated"],
        },
      ],
      observationLinks: [],
      relationships: [],
      resolutions: [],
      candidateConflicts: [],
      candidateFindings: [],
      unresolved: [],
    };
    const result = validateReasonerProposalStructure(raw, snapshot);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations.some((v) => v.code === "UNKNOWN_OBSERVATION_ID")).toBe(true);
    }
  });

  it("parses structured output via ProductionCanonicalReasoner and records usage", async () => {
    const snapshot = minimalSnapshot();
    const { packContext, packSha } = iepPackContext();
    const graphBody = {
      observables: [
        {
          id: "ob-1",
          typeId: "person.student",
          label: "Student",
          identityStatus: "resolved",
          observationIds: ["obs-1"],
        },
      ],
      observationLinks: [{ observationId: "obs-1", observableId: "ob-1" }],
      relationships: [],
      resolutions: [],
      candidateConflicts: [],
      candidateFindings: [],
      unresolved: [],
    };
    let usageReported = false;
    const callModel: CallModel = async () => ({
      outputText: JSON.stringify(graphBody),
      usage: { input_tokens: 1000, output_tokens: 200 },
    });
    const reasoner = new ProductionCanonicalReasoner({
      providerId: "anthropic-canonical-graph-reasoner-v1",
      modelId: "claude-opus-5-5",
      callModel,
      packContext,
      onModelUsage: (usage) => {
        usageReported = true;
        expect(usage.inputTokens).toBe(1000);
        expect(usage.outputTokens).toBe(200);
      },
    });
    const proposal = await reasoner.propose({
      studyRunId: snapshot.studyRunId,
      attemptId: snapshot.attemptId,
      caseId: snapshot.caseId,
      domainId: "iep",
      packPin: iepPackPin(packContext),
      compiledPackContextSha256: packSha,
      observationSnapshot: snapshot,
    });
    expect(proposal.observables).toHaveLength(1);
    expect(proposal.modelPin.promptSha256).toBe(canonicalReasonerPromptSha256());
    expect(usageReported).toBe(true);
  });

  it("classifies provider errors as REASONER_UNAVAILABLE", async () => {
    const snapshot = minimalSnapshot();
    const { packContext, packSha } = iepPackContext();
    const callModel: CallModel = async () => {
      throw new ModelCallError("response_failed", 503, "upstream unavailable");
    };
    const reasoner = new ProductionCanonicalReasoner({
      providerId: "anthropic-canonical-graph-reasoner-v1",
      modelId: "claude-opus-5-5",
      callModel,
      packContext,
    });
    await expect(
      reasoner.propose({
        studyRunId: snapshot.studyRunId,
        attemptId: snapshot.attemptId,
        caseId: snapshot.caseId,
        domainId: "iep",
        packPin: iepPackPin(packContext),
        compiledPackContextSha256: packSha,
        observationSnapshot: snapshot,
      }),
    ).rejects.toBeInstanceOf(CanonicalReasonerUnavailableError);
  });

  it("uses HEAVY_LIFTER tier model for openai engine mode", () => {
    const { iepRoot } = iepPackContext();
    const result = createCanonicalReasonerFromEnv({
      env: {
        MODEL_HEAVY_LIFTER: "heavy-alias-test",
        HIVE_CANONICAL_GRAPH_REASONER_ENGINE: "openai",
        MODEL_PROVIDER: "openai",
      },
      declarativePackRoot: iepRoot,
      callModel: async () => ({ outputText: "{}" }),
    });
    expect(result.modelId).toBe("heavy-alias-test");
  });

  it("fail-closes on provider mismatch without silent substitution", () => {
    const { iepRoot } = iepPackContext();
    expect(() =>
      createCanonicalReasonerFromEnv({
        env: {
          HIVE_CANONICAL_GRAPH_REASONER_ENGINE: "anthropic",
          MODEL_PROVIDER: "openai",
          OPENAI_API_KEY: "sk-test",
        },
        declarativePackRoot: iepRoot,
        callModel: async () => ({ outputText: "{}" }),
      }),
    ).toThrow(CanonicalReasonerUnavailableError);
  });

  it("runs fixture reasoner without live model", async () => {
    const snapshot = minimalSnapshot();
    snapshot.observations = [snapshot.observations[0]!];
    const fixturePath = join(import.meta.dirname, "fixtures/minimal-graph-body.json");
    const reasoner = new FixtureCanonicalReasoner({ fixturePath });
    const proposal = await reasoner.propose({
      studyRunId: snapshot.studyRunId,
      attemptId: snapshot.attemptId,
      caseId: snapshot.caseId,
      domainId: snapshot.domainId,
      packPin: snapshot.packPin,
      compiledPackContextSha256: digest,
      observationSnapshot: snapshot,
    });
    expect(proposal.observationLinks).toHaveLength(1);
  });

  it("surfaces malformed model JSON as MALFORMED_REASONER_PROPOSAL", async () => {
    const snapshot = minimalSnapshot();
    const { packContext, packSha } = iepPackContext();
    const reasoner = new ProductionCanonicalReasoner({
      providerId: "anthropic-canonical-graph-reasoner-v1",
      modelId: "claude-opus-5-5",
      callModel: async () => ({ outputText: "not-json" }),
      packContext,
    });
    await expect(
      reasoner.propose({
        studyRunId: snapshot.studyRunId,
        attemptId: snapshot.attemptId,
        caseId: snapshot.caseId,
        domainId: "iep",
        packPin: iepPackPin(packContext),
        compiledPackContextSha256: packSha,
        observationSnapshot: snapshot,
      }),
    ).rejects.toBeInstanceOf(MalformedCanonicalReasonerProposalError);
  });
});
