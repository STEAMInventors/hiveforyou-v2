import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { resolveCanonicalStudyReportPresentationMode } from "@hiveforyou/shared/canonical-study-report-projection";
import type { HiveWriterProposal } from "@hiveforyou/shared/hive-writer-proposal";

import { projectCanonicalStudyReport } from "../project-canonical-study-report.js";
import { buildDeterministicHiveUiTree } from "../build-deterministic-hive-ui-tree.js";
import { assertHiveUiTree, HiveUiTreeValidationError } from "../validate-hive-ui-tree.js";
import {
  buildSyntheticFoundation,
  mockPages,
  planGoalDoc,
  SYNTHETIC_PACK,
} from "../../study/canonical-study/test-fixtures.js";
import { CANONICAL_STUDY_DEBUG_PACK_APPROVAL } from "../../study/resolve-approved-proposal-domain-pack.js";
import { buildCanonicalStudy } from "../../study/canonical-study/index.js";
import { buildHiveWriterShadowIdempotencyKey } from "./hive-writer-idempotency.js";
import {
  buildHiveWriterModelInput,
  buildHiveWriterPresentationBinding,
} from "./build-hive-writer-model-input.js";
import { READER_DOCUMENT_EXTRACTION_SCHEMA_VERSION } from "@hiveforyou/shared/reader-document-extraction";
import { getDomainPackManifest } from "@hiveforyou/domain-packs";

import { buildCanonicalStudyFoundation } from "../../study/canonical-study-foundation/index.js";
import { L001_READER_PACK_CONTENT_SHA256 } from "../../study/resolve-canonical-study-interpretation.js";
import { resolveDebugCanonicalStudyDomainPack } from "../../study/resolve-approved-proposal-domain-pack.js";
import {
  HiveWriterDomainBindingError,
  assertHiveWriterPersistedStudyRequest,
  resolveHiveWriterDomainBinding,
  resolveHiveWriterDomainBindingForPersistedStudy,
} from "./resolve-hive-writer-domain-binding.js";
import {
  runHiveWriterShadow,
  type HiveWriterShadowPersistence,
} from "./run-hive-writer-shadow.js";
import type { HiveWriterHttpClient } from "./create-writer-http-client.js";
import type { HiveWriterShadowRecord } from "@hiveforyou/shared/hive-writer-proposal";

const PACK_SHA = "a".repeat(64);
const IEP_STUDY_RUN_ID = "f9e833cc-a0f6-4dae-8b50-e27595003864";
const here = dirname(fileURLToPath(import.meta.url));

function buildIepHistoricalArtifact(studyRunId = IEP_STUDY_RUN_ID) {
  const readerPack = resolveDebugCanonicalStudyDomainPack({
    envelopePackId: "iep",
    envelopePackVersion: "0.3.0-proposed",
    envelopePackContentSha256: L001_READER_PACK_CONTENT_SHA256,
  }).pack;
  const foundation = buildCanonicalStudyFoundation({
    pack: readerPack,
    packContentSha256: L001_READER_PACK_CONTENT_SHA256,
    caseId: "case-l001",
    createdAt: "2026-01-01T00:00:00.000Z",
    documents: [
      {
        sourceDocumentId: "plan-a",
        documentPages: mockPages("plan-a", 1, "2024-01-01 reading goal"),
        envelope: {
          schemaVersion: READER_DOCUMENT_EXTRACTION_SCHEMA_VERSION,
          studyRunId,
          attemptId: "attempt-l001",
          caseId: "case-l001",
          userId: "user-l001",
          sourceDocumentId: "plan-a",
          domainId: "iep",
          packId: "iep",
          packVersion: "0.3.0-proposed",
          packContentSha256: L001_READER_PACK_CONTENT_SHA256,
          promptVersion: "hive-pack-driven-reader/0.2.0",
          modelProvider: "fixture",
          modelId: "fixture",
          status: "SUCCEEDED",
          occurredAt: "2026-01-01T00:00:00.000Z",
          parsedModelJson: planGoalDoc("plan-a", "doc.plan", "reading goal", "2024-01-01"),
        },
      },
    ],
  });
  return buildCanonicalStudy({
    pack: readerPack,
    packContentSha256: L001_READER_PACK_CONTENT_SHA256,
    interpretationRulesetId: null,
    interpretationRulesetContentSha256: null,
    foundation,
    sourceContext: {},
    createdAt: "2026-01-01T00:00:00.000Z",
  });
}

function buildSampleArtifact() {
  const foundation = buildSyntheticFoundation({
    documents: [
      {
        sourceDocumentId: "plan-a",
        pages: mockPages("plan-a", 1, "reading Read fluently"),
        parsedModelJson: planGoalDoc("plan-a", "doc.plan", "Read fluently", "2024-01-01"),
      },
    ],
  });
  return buildCanonicalStudy({
    pack: SYNTHETIC_PACK,
    packContentSha256: PACK_SHA,
    interpretationRulesetId: null,
    interpretationRulesetContentSha256: null,
    foundation,
    sourceContext: {},
    createdAt: "2026-01-01T00:00:00.000Z",
  });
}

function buildCustomerProjection() {
  const artifact = buildSampleArtifact();
  const projection = projectCanonicalStudyReport({
    artifact,
    audience: "customer",
    customerProReportsPermitted: false,
    packApprovalLabel: CANONICAL_STUDY_DEBUG_PACK_APPROVAL,
  });
  return { artifact, projection };
}

function buildProProjection() {
  const artifact = buildSampleArtifact();
  const projection = projectCanonicalStudyReport({
    artifact,
    audience: "pro",
    customerProReportsPermitted: false,
    packApprovalLabel: CANONICAL_STUDY_DEBUG_PACK_APPROVAL,
  });
  return { artifact, projection };
}

function buildMockProposal(
  artifact: ReturnType<typeof buildSampleArtifact>,
  projection: ReturnType<typeof buildCustomerProjection>["projection"],
  tree: NonNullable<ReturnType<typeof buildDeterministicHiveUiTree>>,
): HiveWriterProposal {
  const domainBinding = resolveHiveWriterDomainBinding({ artifact, projection });
  return {
    schemaVersion: "hive-writer-proposal/1",
    domainBinding,
    presentationBinding: buildHiveWriterPresentationBinding(projection),
    hiveUiTree: tree,
    writerMetadata: { writerImplementationVersion: "1" },
  };
}

function mockWriterFromDeterministicTree(
  artifact: ReturnType<typeof buildSampleArtifact>,
  projection: ReturnType<typeof buildCustomerProjection>["projection"],
): HiveWriterHttpClient {
  return async () => {
    const tree = buildDeterministicHiveUiTree(projection);
    if (!tree) {
      throw new Error("NO_DETERMINISTIC_TREE");
    }
    assertHiveUiTree(artifact, projection, tree);
    return {
      proposal: buildMockProposal(artifact, projection, tree),
      modelIdentifier: "mock-writer",
      tokenUsage: { inputTokens: 10, outputTokens: 20 },
    };
  };
}

function inMemoryPersistence(): {
  persistence: HiveWriterShadowPersistence;
  records: Map<string, HiveWriterShadowRecord>;
} {
  const records = new Map<string, HiveWriterShadowRecord>();
  return {
    records,
    persistence: {
      load: async (key) => records.get(key) ?? null,
      save: async (record) => {
        records.set(record.idempotencyKey, record);
      },
    },
  };
}

describe("hive-writer shadow", () => {
  it("accepts valid customer and pro proposals from mocked Writer responses", async () => {
    for (const build of [buildCustomerProjection, buildProProjection]) {
      const { artifact, projection } = build();
      const record = await runHiveWriterShadow({
        artifact,
        projection,
        invokeWriter: mockWriterFromDeterministicTree(artifact, projection),
        persistence: inMemoryPersistence().persistence,
      });
      expect(record.status).toBe("accepted");
      expect(record.hiveUiTree).not.toBeNull();
      expect(record.validation.ok).toBe(true);
    }
  });

  it("resolves synthetic test domain binding from artifact pack metadata", () => {
    const { artifact, projection } = buildCustomerProjection();
    const binding = resolveHiveWriterDomainBinding({ artifact, projection });
    expect(binding.domainId).toBe("synthetic");
    expect(binding.packId).toBe("synthetic-test");
    expect(binding.packContentSha256).toBe(PACK_SHA);
  });

  it("rejects fabricated claim references", async () => {
    const { artifact, projection } = buildCustomerProjection();
    const tree = buildDeterministicHiveUiTree(projection);
    expect(tree).not.toBeNull();
    const factKey = Object.keys(tree!.elements).find((k) => tree!.elements[k]?.type === "FactRow");
    expect(factKey).toBeTruthy();
    tree!.elements[factKey!] = {
      type: "FactRow",
      props: { claimRef: { fieldKey: "missing-field-key" } },
    };
    const record = await runHiveWriterShadow({
      artifact,
      projection,
      invokeWriter: async () => ({
        proposal: buildMockProposal(artifact, projection, tree!),
        modelIdentifier: "mock",
        tokenUsage: null,
      }),
      persistence: inMemoryPersistence().persistence,
    });
    expect(record.status).toBe("rejected");
    expect(record.hiveUiTree).toBeNull();
    expect(record.validation.errorCodes).toContain("HIVE_UI_TREE_INVALID");
  });

  it("rejects factual free-text props", async () => {
    const { artifact, projection } = buildCustomerProjection();
    const tree = buildDeterministicHiveUiTree(projection);
    expect(tree).not.toBeNull();
    tree!.elements["rogue"] = {
      type: "FactRow",
      props: { claimRef: { fieldKey: "x" }, displayText: "fabricated" } as never,
    };
    const record = await runHiveWriterShadow({
      artifact,
      projection,
      invokeWriter: async () => ({
        proposal: buildMockProposal(artifact, projection, tree!),
        modelIdentifier: "mock",
        tokenUsage: null,
      }),
      persistence: inMemoryPersistence().persistence,
    });
    expect(record.status).toBe("rejected");
  });

  it("rejects unsupported components and audience or hash mismatches", async () => {
    const { artifact, projection } = buildCustomerProjection();
    const tree = buildDeterministicHiveUiTree(projection);
    expect(tree).not.toBeNull();
    tree!.elements["rogue"] = {
      type: "ProSection" as never,
      props: { sectionKey: "export" },
      children: [],
    };
    const badAudience = await runHiveWriterShadow({
      artifact,
      projection,
      invokeWriter: async () => {
        const proposal = buildMockProposal(artifact, projection, tree!);
        return {
          proposal: {
            ...proposal,
            hiveUiTree: { ...tree!, audience: "pro" },
          },
          modelIdentifier: "mock",
          tokenUsage: null,
        };
      },
      persistence: inMemoryPersistence().persistence,
    });
    expect(badAudience.status).toBe("rejected");

    const badHash = await runHiveWriterShadow({
      artifact,
      projection,
      invokeWriter: async () => {
        const proposal = buildMockProposal(artifact, projection, tree!);
        return {
          proposal: {
            ...proposal,
            hiveUiTree: { ...tree!, sourceReportArtifactHash: "b".repeat(64) },
          },
          modelIdentifier: "mock",
          tokenUsage: null,
        };
      },
      persistence: inMemoryPersistence().persistence,
    });
    expect(badHash.status).toBe("rejected");
  });

  it("rejects wrong domainId or pack hash in proposal bindings", async () => {
    const { artifact, projection } = buildCustomerProjection();
    const tree = buildDeterministicHiveUiTree(projection);
    expect(tree).not.toBeNull();

    const badDomain = await runHiveWriterShadow({
      artifact,
      projection,
      invokeWriter: async () => {
        const proposal = buildMockProposal(artifact, projection, tree!);
        return {
          proposal: {
            ...proposal,
            domainBinding: { ...proposal.domainBinding, domainId: "iep" },
          },
          modelIdentifier: "mock",
          tokenUsage: null,
        };
      },
      persistence: inMemoryPersistence().persistence,
    });
    expect(badDomain.status).toBe("failed");
    expect(badDomain.validation.errorCodes).toContain("WRITER_BINDING_MISMATCH");

    const badPackHash = await runHiveWriterShadow({
      artifact,
      projection,
      invokeWriter: async () => {
        const proposal = buildMockProposal(artifact, projection, tree!);
        return {
          proposal: {
            ...proposal,
            domainBinding: { ...proposal.domainBinding, packContentSha256: "b".repeat(64) },
          },
          modelIdentifier: "mock",
          tokenUsage: null,
        };
      },
      persistence: inMemoryPersistence().persistence,
    });
    expect(badPackHash.status).toBe("failed");
    expect(badPackHash.validation.errorCodes).toContain("WRITER_BINDING_MISMATCH");
  });

  it("rejects missing provenance when evidence chips are required", async () => {
    const { artifact, projection } = buildCustomerProjection();
    const fact = projection.body.storySections[0]?.facts[0];
    if (!fact) {
      return;
    }
    fact.evidence = [];
    const tree = buildDeterministicHiveUiTree(projection);
    expect(tree).not.toBeNull();
    const record = await runHiveWriterShadow({
      artifact,
      projection,
      invokeWriter: async () => ({
        proposal: buildMockProposal(artifact, projection, tree!),
        modelIdentifier: "mock",
        tokenUsage: null,
      }),
      persistence: inMemoryPersistence().persistence,
    });
    expect(record.status).toBe("rejected");
    expect(() => assertHiveUiTree(artifact, projection, tree)).toThrow(HiveUiTreeValidationError);
  });

  it("records failed model requests without a validated tree", async () => {
    const { artifact, projection } = buildCustomerProjection();
    const record = await runHiveWriterShadow({
      artifact,
      projection,
      invokeWriter: async () => {
        throw new Error("WRITER_HTTP_503:unavailable");
      },
      persistence: inMemoryPersistence().persistence,
    });
    expect(record.status).toBe("failed");
    expect(record.hiveUiTree).toBeNull();
  });

  it("does not duplicate paid model calls for identical requests", async () => {
    const { artifact, projection } = buildCustomerProjection();
    const invokeWriter = vi.fn(mockWriterFromDeterministicTree(artifact, projection));
    const store = inMemoryPersistence();
    const first = await runHiveWriterShadow({
      artifact,
      projection,
      invokeWriter,
      persistence: store.persistence,
    });
    const second = await runHiveWriterShadow({
      artifact,
      projection,
      invokeWriter,
      persistence: store.persistence,
    });
    expect(first.status).toBe("accepted");
    expect(second.status).toBe("accepted");
    expect(invokeWriter).toHaveBeenCalledTimes(1);
  });

  it("does not reference canonical-study or reader modules from writer shadow orchestration", async () => {
    const source = readFileSync(join(here, "run-hive-writer-shadow.ts"), "utf8");
    expect(source).not.toMatch(/runCanonicalStudy|run-canonical-study|reader/i);
  });

  it("canonical report GET route does not invoke writer shadow generation", () => {
    const repoRoot = join(here, "../../../../..");
    const routePath = join(repoRoot, "app/src/app/api/case/[caseId]/canonical-report/route.ts");
    const servicePath = join(repoRoot, "app/src/lib/canonical-report/canonical-report-service-server.ts");
    const routeSource = readFileSync(routePath, "utf8");
    const serviceSource = readFileSync(servicePath, "utf8");
    expect(routeSource).not.toMatch(/hive-writer|runHiveWriterShadow/);
    expect(serviceSource).not.toMatch(/hive-writer|runHiveWriterShadow/);
  });

  it("uses stable idempotency keys from pack and projection content hashes", () => {
    const { artifact, projection } = buildCustomerProjection();
    const binding = resolveHiveWriterDomainBinding({ artifact, projection });
    const keyA = buildHiveWriterShadowIdempotencyKey({
      caseId: projection.caseId,
      studyRunId: projection.studyRunId,
      audience: projection.audience,
      packContentSha256: binding.packContentSha256,
      reportProjectionContentSha256: binding.reportProjectionContentSha256,
    });
    const keyB = buildHiveWriterShadowIdempotencyKey({
      caseId: projection.caseId,
      studyRunId: projection.studyRunId,
      audience: projection.audience,
      packContentSha256: binding.packContentSha256,
      reportProjectionContentSha256: binding.reportProjectionContentSha256,
    });
    expect(keyA).toBe(keyB);
    expect(keyA).toHaveLength(64);
  });

  it("builds hive-writer-input/1 without document text or quotations", () => {
    const { artifact, projection } = buildCustomerProjection();
    const domainBinding = resolveHiveWriterDomainBinding({ artifact, projection });
    const input = buildHiveWriterModelInput({
      projection,
      domainBinding,
      publicationRestrictions: {
        presentationMode: projection.presentationMode,
        customerProReportsPermitted: projection.customerProReportsPermitted,
      },
    });
    expect(input.schemaVersion).toBe("hive-writer-input/1");
    const serialized = JSON.stringify(input);
    expect(serialized).not.toMatch(/Read fluently/);
    expect(serialized).not.toContain("displayText");
  });

  it("preserves approved vs internal_preview presentation metadata on projections used for writer input", () => {
    const { artifact } = buildCustomerProjection();
    const approved = projectCanonicalStudyReport({
      artifact,
      audience: "customer",
      customerProReportsPermitted: true,
      packApprovalLabel: "APPROVED_PACK",
    });
    expect(
      resolveCanonicalStudyReportPresentationMode({
        customerProReportsPermitted: true,
        packApprovalLabel: "APPROVED_PACK",
      }),
    ).toBe("approved");
    expect(approved.presentationMode).toBe("approved");
  });
});

describe("resolveHiveWriterDomainBinding", () => {
  it("binds IEP historical reader snapshot when live registry scaffold version differs", () => {
    const artifact = buildIepHistoricalArtifact();
    const projection = projectCanonicalStudyReport({
      artifact,
      audience: "customer",
      customerProReportsPermitted: false,
      packApprovalLabel: CANONICAL_STUDY_DEBUG_PACK_APPROVAL,
    });
    const binding = resolveHiveWriterDomainBinding({ artifact, projection });
    expect(binding.domainId).toBe("iep");
    expect(binding.packVersion).toBe("0.3.0-proposed");
    expect(binding.packContentSha256).toBe(L001_READER_PACK_CONTENT_SHA256);
    expect(getDomainPackManifest("iep")?.version).not.toBe("0.3.0-proposed");
  });

  it("reuses binding for studyRunId f9e833cc when artifact pins the L001 reader snapshot", () => {
    const artifact = buildIepHistoricalArtifact(IEP_STUDY_RUN_ID);
    const projection = projectCanonicalStudyReport({
      artifact,
      audience: "pro",
      customerProReportsPermitted: false,
      packApprovalLabel: CANONICAL_STUDY_DEBUG_PACK_APPROVAL,
    });
    const binding = resolveHiveWriterDomainBindingForPersistedStudy({
      studyRunId: IEP_STUDY_RUN_ID,
      audience: "pro",
      artifact,
      projection,
    });
    expect(binding.domainId).toBe("iep");
    expect(binding.packContentSha256).toBe(L001_READER_PACK_CONTENT_SHA256);
  });

  it("rejects missing or invalid snapshot hash", () => {
    const { artifact, projection } = buildCustomerProjection();
    artifact.packContentSha256 = "not-a-hash";
    expect(() => resolveHiveWriterDomainBinding({ artifact, projection })).toThrow(
      HiveWriterDomainBindingError,
    );
  });

  it("rejects pack id/version mismatch against verified snapshot manifest", () => {
    const artifact = buildIepHistoricalArtifact();
    artifact.packVersion = "9.9.9-wrong";
    const projection = projectCanonicalStudyReport({
      artifact,
      audience: "customer",
      customerProReportsPermitted: false,
      packApprovalLabel: CANONICAL_STUDY_DEBUG_PACK_APPROVAL,
    });
    expect(() => resolveHiveWriterDomainBinding({ artifact, projection })).toThrow(
      /snapshot manifest|pack id\/version/i,
    );
  });

  it("rejects unknown pack hash for registered domain", () => {
    const artifact = buildIepHistoricalArtifact();
    artifact.packContentSha256 = "b".repeat(64);
    const projection = projectCanonicalStudyReport({
      artifact,
      audience: "customer",
      customerProReportsPermitted: false,
      packApprovalLabel: CANONICAL_STUDY_DEBUG_PACK_APPROVAL,
    });
    expect(() => resolveHiveWriterDomainBinding({ artifact, projection })).toThrow(
      HiveWriterDomainBindingError,
    );
  });

  it("assertHiveWriterPersistedStudyRequest rejects studyRunId and audience drift", () => {
    const { artifact, projection } = buildCustomerProjection();
    expect(() =>
      assertHiveWriterPersistedStudyRequest({
        studyRunId: "other-run",
        audience: "customer",
        artifact,
        projection,
      }),
    ).toThrow(/studyRunId/i);
    expect(() =>
      assertHiveWriterPersistedStudyRequest({
        studyRunId: artifact.studyRunId,
        audience: "pro",
        artifact,
        projection,
      }),
    ).toThrow(/audience/i);
  });
});
