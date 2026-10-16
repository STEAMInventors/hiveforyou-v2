import { describe, expect, it } from "vitest";

import type { HiveWriterProposal } from "@hiveforyou/shared/hive-writer-proposal";

import { buildDeterministicHiveUiTree } from "../build-deterministic-hive-ui-tree.js";
import { projectCanonicalStudyReport } from "../project-canonical-study-report.js";
import { assertHiveUiTree } from "../validate-hive-ui-tree.js";
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
  buildHiveWriterPresentationBinding,
} from "./build-hive-writer-model-input.js";
import { resolveHiveWriterDomainBinding } from "./resolve-hive-writer-domain-binding.js";
import { resolveWriterHiveUiTreeForPreview } from "./resolve-writer-hive-ui-tree-for-preview.js";
import {
  runHiveWriterShadow,
  type HiveWriterShadowPersistence,
} from "./run-hive-writer-shadow.js";

const PACK_SHA = "a".repeat(64);

function buildSampleArtifact() {
  const foundation = buildSyntheticFoundation({
    documents: [
      {
        sourceDocumentId: "plan-a",
        pages: mockPages("plan-a", 1, "Reading Read fluently"),
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

function inMemoryPersistence(): HiveWriterShadowPersistence {
  const records = new Map<string, Awaited<ReturnType<HiveWriterShadowPersistence["load"]>>>();
  return {
    load: async (key) => records.get(key) ?? null,
    save: async (record) => {
      records.set(record.idempotencyKey, record);
    },
  };
}

async function acceptedRecord() {
  const { artifact, projection } = buildCustomerProjection();
  const persistence = inMemoryPersistence();
  const record = await runHiveWriterShadow({
    artifact,
    projection,
    invokeWriter: async () => {
      const tree = buildDeterministicHiveUiTree(projection);
      if (!tree) {
        throw new Error("NO_TREE");
      }
      assertHiveUiTree(artifact, projection, tree);
      return {
        proposal: buildMockProposal(artifact, projection, tree),
        modelIdentifier: "mock-writer",
        tokenUsage: null,
      };
    },
    persistence,
  });
  expect(record.status).toBe("accepted");
  return { artifact, projection, record };
}

describe("resolveWriterHiveUiTreeForPreview", () => {
  it("returns writer layout for an accepted, bound shadow record", async () => {
    const { artifact, projection, record } = await acceptedRecord();
    const resolution = resolveWriterHiveUiTreeForPreview({
      artifact,
      projection,
      record,
    });
    expect(resolution.layout).toBe("writer");
    expect(resolution.hiveUiTree).not.toBeNull();
    expect(resolution.fallbackReason).toBeNull();
  });

  it("does not treat a queued record as a validated writer layout", async () => {
    const { artifact, projection, record } = await acceptedRecord();
    const queued = { ...record, status: "queued" as const, hiveUiTree: null, proposal: null };
    const resolution = resolveWriterHiveUiTreeForPreview({
      artifact,
      projection,
      record: queued,
    });
    expect(resolution.layout).toBe("deterministic_fallback");
    expect(resolution.fallbackReason?.code).toBe("WRITER_IN_FLIGHT");
    expect(resolution.hiveUiTree).toBeNull();
  });

  it("falls back when no record exists", () => {
    const { artifact, projection } = buildCustomerProjection();
    const resolution = resolveWriterHiveUiTreeForPreview({
      artifact,
      projection,
      record: null,
    });
    expect(resolution.shadowStatus).toBe("missing");
    expect(resolution.fallbackReason?.code).toBe("WRITER_RECORD_MISSING");
  });

  it("falls back on invalid claim references in a rejected record", async () => {
    const { artifact, projection } = buildCustomerProjection();
    const tree = buildDeterministicHiveUiTree(projection);
    expect(tree).not.toBeNull();
    const factKey = Object.keys(tree!.elements).find((k) => tree!.elements[k]?.type === "FactRow");
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
      persistence: inMemoryPersistence(),
    });
    expect(record.status).toBe("rejected");
    const resolution = resolveWriterHiveUiTreeForPreview({
      artifact,
      projection,
      record,
    });
    expect(resolution.layout).toBe("deterministic_fallback");
    expect(resolution.fallbackReason?.code).toBe("WRITER_RECORD_NOT_ACCEPTED");
  });

  it("falls back when idempotency key does not match current projection binding", async () => {
    const { artifact, projection, record } = await acceptedRecord();
    const stale = {
      ...record,
      idempotencyKey: buildHiveWriterShadowIdempotencyKey({
        caseId: projection.caseId,
        studyRunId: projection.studyRunId,
        audience: projection.audience,
        packContentSha256: "b".repeat(64),
        reportProjectionContentSha256: record.observability.projectionHash,
      }),
    };
    const resolution = resolveWriterHiveUiTreeForPreview({
      artifact,
      projection,
      record: stale,
    });
    expect(resolution.fallbackReason?.code).toBe("WRITER_BINDING_STALE");
  });

  it("falls back when observability projection hash is stale", async () => {
    const { artifact, projection, record } = await acceptedRecord();
    const stale = {
      ...record,
      observability: {
        ...record.observability,
        projectionHash: "c".repeat(64),
      },
    };
    const resolution = resolveWriterHiveUiTreeForPreview({
      artifact,
      projection,
      record: stale,
    });
    expect(resolution.fallbackReason?.code).toBe("WRITER_PROJECTION_STALE");
  });

  it("falls back when proposal domain binding was tampered after acceptance", async () => {
    const { artifact, projection, record } = await acceptedRecord();
    const tampered = {
      ...record,
      proposal: record.proposal
        ? {
            ...record.proposal,
            domainBinding: {
              ...record.proposal.domainBinding,
              domainId: "iep",
            },
          }
        : null,
    };
    const resolution = resolveWriterHiveUiTreeForPreview({
      artifact,
      projection,
      record: tampered,
    });
    expect(resolution.layout).toBe("deterministic_fallback");
    expect(resolution.fallbackReason?.errorCodes).toContain("WRITER_BINDING_MISMATCH");
  });

  it("falls back when record audience scope does not match projection", async () => {
    const { artifact, projection, record } = await acceptedRecord();
    const wrongAudience = { ...record, audience: "pro" as const };
    const resolution = resolveWriterHiveUiTreeForPreview({
      artifact,
      projection,
      record: wrongAudience,
    });
    expect(resolution.fallbackReason?.code).toBe("WRITER_RECORD_SCOPE_MISMATCH");
  });
});
