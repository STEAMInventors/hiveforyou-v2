import { describe, expect, it, vi } from "vitest";

import { CANONICAL_STUDY_DEBUG_PACK_APPROVAL } from "../../study/resolve-approved-proposal-domain-pack.js";
import {
  buildSyntheticFoundation,
  mockPages,
  planGoalDoc,
  SYNTHETIC_PACK,
} from "../../study/canonical-study/test-fixtures.js";
import { buildCanonicalStudy } from "../../study/canonical-study/index.js";
import { buildDeterministicHiveUiTree } from "../build-deterministic-hive-ui-tree.js";
import { projectCanonicalStudyReport } from "../project-canonical-study-report.js";
import { WriterShadowOwnerError } from "./assert-writer-shadow-owner.js";
import { buildHiveWriterPresentationBinding } from "./build-hive-writer-model-input.js";
import {
  enqueueHiveWriterShadowPreviewRequest,
  executeHiveWriterShadowRequest,
  type WriterShadowObjectGateway,
} from "./execute-hive-writer-shadow.js";
import { resolveHiveWriterDomainBinding } from "./resolve-hive-writer-domain-binding.js";
import type { HiveWriterHttpClient } from "./create-writer-http-client.js";

const PACK_SHA = "a".repeat(64);
const OWNER = "user-owner";

function sampleArtifact(publication?: { customerProReportsPermitted: boolean; packApprovalLabel: string }) {
  const foundation = buildSyntheticFoundation({
    documents: [
      {
        sourceDocumentId: "plan-a",
        pages: mockPages("plan-a", 1, "reading Read fluently"),
        parsedModelJson: planGoalDoc("plan-a", "doc.plan", "Read fluently", "2024-01-01"),
      },
    ],
  });
  const artifact = buildCanonicalStudy({
    pack: SYNTHETIC_PACK,
    packContentSha256: PACK_SHA,
    interpretationRulesetId: null,
    interpretationRulesetContentSha256: null,
    foundation,
    sourceContext: {},
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  return Object.assign(artifact, publication ?? {
    customerProReportsPermitted: false as const,
    packApprovalLabel: CANONICAL_STUDY_DEBUG_PACK_APPROVAL,
  });
}

function memoryGateway(ownerUserId: string) {
  const objects = new Map<string, Uint8Array>();
  const selects: Array<{ table: string; where: Record<string, string | number> }> = [];
  const gateway = {
    selects,
    async insert() {},
    async upsert() {},
    async updateWhere() {},
    async selectWhere(table: string, where: Record<string, string | number>) {
      selects.push({ table, where });
      if (table === "study_runs" && where.id === "study-test") {
        return [{ id: "study-test", case_id: "case-test", user_id: ownerUserId }];
      }
      if (table === "cases" && where.id === "case-test") {
        return [{ id: "case-test", user_id: ownerUserId }];
      }
      return [];
    },
    async downloadObject(_bucket: string, path: string) {
      const bytes = objects.get(path);
      if (!bytes) {
        throw new Error("STORAGE_OBJECT_MISSING");
      }
      return bytes;
    },
    async uploadObject(_bucket: string, path: string, bytes: Uint8Array) {
      objects.set(path, bytes);
    },
    async removeObject() {},
  };
  return gateway as WriterShadowObjectGateway & { selects: typeof selects };
}

function writerFromArtifact(
  artifact: ReturnType<typeof sampleArtifact>,
): HiveWriterHttpClient {
  const projection = projectCanonicalStudyReport({
    artifact,
    audience: "customer",
    customerProReportsPermitted: false,
    packApprovalLabel: CANONICAL_STUDY_DEBUG_PACK_APPROVAL,
  });
  const tree = buildDeterministicHiveUiTree(projection);
  if (!tree) {
    throw new Error("NO_TREE");
  }
  const domainBinding = resolveHiveWriterDomainBinding({ artifact, projection });
  return async () => ({
    proposal: {
      schemaVersion: "hive-writer-proposal/1",
      domainBinding,
      presentationBinding: buildHiveWriterPresentationBinding(projection),
      hiveUiTree: tree,
      writerMetadata: { writerImplementationVersion: "1" },
    },
    modelIdentifier: "mock-writer",
    tokenUsage: null,
  });
}

describe("executeHiveWriterShadowRequest", () => {
  it("looks up the study and case by id and rejects a mismatched event user", async () => {
    const gateway = memoryGateway(OWNER);
    const loadArtifact = vi.fn();
    await expect(
      executeHiveWriterShadowRequest({
        claimedUserId: "someone-else",
        caseId: "case-test",
        studyRunId: "study-test",
        audience: "customer",
        env: { HIVE_WRITER_SHADOW_MODE: "true" },
        gateway,
        loadArtifact,
      }),
    ).rejects.toBeInstanceOf(WriterShadowOwnerError);
    expect(loadArtifact).not.toHaveBeenCalled();
    expect(gateway.selects.map((call) => call.where)).toEqual([{ id: "study-test" }, { id: "case-test" }]);
  });

  it("does not call Writer when shadow mode is disabled", async () => {
    const artifact = sampleArtifact();
    const invokeWriter = vi.fn(writerFromArtifact(artifact));
    const record = await executeHiveWriterShadowRequest({
      claimedUserId: OWNER,
      caseId: artifact.caseId,
      studyRunId: artifact.studyRunId,
      audience: "customer",
      env: { HIVE_WRITER_SHADOW_MODE: "false" },
      gateway: memoryGateway(OWNER),
      loadArtifact: async (userId) => {
        expect(userId).toBe(OWNER);
        return artifact;
      },
      invokeWriter,
    });
    expect(record.status).toBe("skipped");
    expect(invokeWriter).not.toHaveBeenCalled();
  });

  it("does not call Writer when the persisted study is approved for publication", async () => {
    const artifact = sampleArtifact({
      customerProReportsPermitted: true,
      packApprovalLabel: "certified-pack",
    });
    const invokeWriter = vi.fn(writerFromArtifact(artifact));
    const record = await executeHiveWriterShadowRequest({
      claimedUserId: OWNER,
      caseId: artifact.caseId,
      studyRunId: artifact.studyRunId,
      audience: "customer",
      env: { HIVE_WRITER_SHADOW_MODE: "true", HIVE_AGENTS_HOST: "127.0.0.1" },
      gateway: memoryGateway(OWNER),
      loadArtifact: async () => artifact,
      invokeWriter,
    });
    expect(record.status).toBe("failed");
    expect(record.validation.errorCodes).toContain("WRITER_SHADOW_PUBLICATION_BLOCKED");
    expect(invokeWriter).not.toHaveBeenCalled();
  });

  it("rejects a public Writer host before invoking the model", async () => {
    const artifact = sampleArtifact();
    const invokeWriter = vi.fn(writerFromArtifact(artifact));
    await expect(
      executeHiveWriterShadowRequest({
        claimedUserId: OWNER,
        caseId: artifact.caseId,
        studyRunId: artifact.studyRunId,
        audience: "customer",
        env: { HIVE_WRITER_SHADOW_MODE: "true", HIVE_AGENTS_HOST: "203.0.113.10" },
        gateway: memoryGateway(OWNER),
        loadArtifact: async () => artifact,
        invokeWriter,
      }),
    ).rejects.toThrow("WRITER_HOST_NOT_LOOPBACK");
    expect(invokeWriter).not.toHaveBeenCalled();
  });

  it("calls Writer once and reuses the accepted record", async () => {
    const artifact = sampleArtifact();
    const invokeWriter = vi.fn(writerFromArtifact(artifact));
    const gateway = memoryGateway(OWNER);
    const first = await executeHiveWriterShadowRequest({
      claimedUserId: OWNER,
      caseId: artifact.caseId,
      studyRunId: artifact.studyRunId,
      audience: "customer",
      env: { HIVE_WRITER_SHADOW_MODE: "true" },
      gateway,
      loadArtifact: async () => artifact,
      invokeWriter,
    });
    const second = await executeHiveWriterShadowRequest({
      claimedUserId: OWNER,
      caseId: artifact.caseId,
      studyRunId: artifact.studyRunId,
      audience: "customer",
      env: { HIVE_WRITER_SHADOW_MODE: "true" },
      gateway,
      loadArtifact: async () => artifact,
      invokeWriter,
    });
    expect(first.status).toBe("accepted");
    expect(second.status).toBe("accepted");
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(invokeWriter).toHaveBeenCalledTimes(1);
  });

  it("stores a rejected tree and does not call Writer again", async () => {
    const artifact = sampleArtifact();
    const invokeWriter = vi.fn(async () => {
      const valid = await writerFromArtifact(artifact)({} as never);
      return {
        ...valid,
        proposal: {
          ...valid.proposal,
          hiveUiTree: {
            ...valid.proposal.hiveUiTree,
            elements: {
              ...valid.proposal.hiveUiTree.elements,
              bad: { type: "FactRow", props: { claimRef: { fieldKey: "missing-field" } }, children: [] },
            },
          },
        },
      };
    });
    const gateway = memoryGateway(OWNER);
    const first = await executeHiveWriterShadowRequest({
      claimedUserId: OWNER,
      caseId: artifact.caseId,
      studyRunId: artifact.studyRunId,
      audience: "customer",
      env: { HIVE_WRITER_SHADOW_MODE: "true" },
      gateway,
      loadArtifact: async () => artifact,
      invokeWriter,
    });
    const second = await executeHiveWriterShadowRequest({
      claimedUserId: OWNER,
      caseId: artifact.caseId,
      studyRunId: artifact.studyRunId,
      audience: "customer",
      env: { HIVE_WRITER_SHADOW_MODE: "true" },
      gateway,
      loadArtifact: async () => artifact,
      invokeWriter,
    });
    expect(first.status).toBe("rejected");
    expect(first.hiveUiTree).toBeNull();
    expect(second.status).toBe("rejected");
    expect(invokeWriter).toHaveBeenCalledTimes(1);
  });
});

describe("enqueueHiveWriterShadowPreviewRequest", () => {
  it("persists queued and dispatches without invoking Writer HTTP", async () => {
    const artifact = sampleArtifact();
    const gateway = memoryGateway(OWNER);
    const dispatchRequested = vi.fn(async () => {});
    const record = await enqueueHiveWriterShadowPreviewRequest({
      claimedUserId: OWNER,
      caseId: artifact.caseId,
      studyRunId: artifact.studyRunId,
      audience: "customer",
      env: { HIVE_WRITER_SHADOW_MODE: "true", VERCEL_ENV: "preview" },
      gateway,
      loadArtifact: async () => artifact,
      dispatchRequested,
    });
    expect(record.status).toBe("queued");
    expect(dispatchRequested).toHaveBeenCalledTimes(1);
    expect(dispatchRequested).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: OWNER,
        caseId: artifact.caseId,
        studyRunId: artifact.studyRunId,
        audience: "customer",
        idempotencyKey: record.idempotencyKey,
      }),
    );
  });

  it("resends Inngest for in-flight rows without rewriting storage", async () => {
    const artifact = sampleArtifact();
    const gateway = memoryGateway(OWNER);
    const dispatchRequested = vi.fn(async () => {});
    const first = await enqueueHiveWriterShadowPreviewRequest({
      claimedUserId: OWNER,
      caseId: artifact.caseId,
      studyRunId: artifact.studyRunId,
      audience: "customer",
      env: { HIVE_WRITER_SHADOW_MODE: "true", VERCEL_ENV: "preview" },
      gateway,
      loadArtifact: async () => artifact,
      dispatchRequested,
    });
    const second = await enqueueHiveWriterShadowPreviewRequest({
      claimedUserId: OWNER,
      caseId: artifact.caseId,
      studyRunId: artifact.studyRunId,
      audience: "customer",
      env: { HIVE_WRITER_SHADOW_MODE: "true", VERCEL_ENV: "preview" },
      gateway,
      loadArtifact: async () => artifact,
      dispatchRequested,
    });
    expect(first.status).toBe("queued");
    expect(second.status).toBe("queued");
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(dispatchRequested).toHaveBeenCalledTimes(2);
  });
});
