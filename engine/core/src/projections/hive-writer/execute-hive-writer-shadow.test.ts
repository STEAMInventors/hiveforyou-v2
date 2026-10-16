import { describe, expect, it, vi } from "vitest";

import {
  hiveWriterShadowLatestAcceptedPath,
  hiveWriterShadowLegacyBindingRecordPath,
  hiveWriterShadowRecordPath,
} from "@hiveforyou/shared/hive-artifact-paths";

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
import { buildHiveWriterShadowIdempotencyKey } from "./hive-writer-idempotency.js";
import {
  enqueueHiveWriterShadowPreviewRequest,
  executeHiveWriterShadowRequest,
  type WriterShadowObjectGateway,
} from "./execute-hive-writer-shadow.js";
import { buildHiveWriterShadowMarkerRecord } from "./run-hive-writer-shadow.js";
import { resolveHiveWriterDomainBinding } from "./resolve-hive-writer-domain-binding.js";
import type { HiveWriterHttpClient } from "./create-writer-http-client.js";

const PACK_SHA = "a".repeat(64);
const OWNER = "user-owner";
const RUN_A = "11111111-1111-4111-8111-111111111111";
const RUN_B = "22222222-2222-4222-8222-222222222222";
const RUN_C = "33333333-3333-4333-8333-333333333333";

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

function memoryGateway(
  ownerUserId: string,
  options?: { rejectDuplicateUploadWithoutUpsert?: boolean },
) {
  const objects = new Map<string, Uint8Array>();
  const selects: Array<{ table: string; where: Record<string, string | number> }> = [];
  const gateway = {
    selects,
    objects,
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
    async uploadObject(
      _bucket: string,
      path: string,
      bytes: Uint8Array,
      _contentType?: string,
      uploadOptions?: { upsert?: boolean },
    ) {
      if (options?.rejectDuplicateUploadWithoutUpsert && objects.has(path) && !uploadOptions?.upsert) {
        throw new Error("The resource already exists");
      }
      objects.set(path, bytes);
    },
    async removeObject() {},
  };
  return gateway as WriterShadowObjectGateway & { selects: typeof selects; objects: typeof objects };
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

function bindingKeyForArtifact(artifact: ReturnType<typeof sampleArtifact>, audience: "customer" | "pro" = "customer") {
  const projection = projectCanonicalStudyReport({
    artifact,
    audience,
    customerProReportsPermitted: false,
    packApprovalLabel: CANONICAL_STUDY_DEBUG_PACK_APPROVAL,
  });
  const domainBinding = resolveHiveWriterDomainBinding({ artifact, projection });
  return buildHiveWriterShadowIdempotencyKey({
    caseId: projection.caseId,
    studyRunId: projection.studyRunId,
    audience: projection.audience,
    packContentSha256: domainBinding.packContentSha256,
    reportProjectionContentSha256: domainBinding.reportProjectionContentSha256,
  });
}

describe("executeHiveWriterShadowRequest", () => {
  it("rejects unknown studyRunId before loading canonical study artifacts", async () => {
    const gateway = memoryGateway(OWNER);
    const loadArtifact = vi.fn();
    await expect(
      executeHiveWriterShadowRequest({
        claimedUserId: OWNER,
        caseId: "case-test",
        studyRunId: "missing-study-run",
        audience: "customer",
        writerRunId: RUN_A,
        env: {},
        gateway,
        loadArtifact,
      }),
    ).rejects.toBeInstanceOf(WriterShadowOwnerError);
    expect(loadArtifact).not.toHaveBeenCalled();
  });

  it("does not call Writer when the persisted study is approved for publication", async () => {
    const artifact = sampleArtifact({
      customerProReportsPermitted: true,
      packApprovalLabel: "certified-pack",
    });
    const invokeWriter = vi.fn(writerFromArtifact(artifact));
    const gateway = memoryGateway(OWNER);
    const projection = projectCanonicalStudyReport({
      artifact,
      audience: "customer",
      customerProReportsPermitted: true,
      packApprovalLabel: "certified-pack",
    });
    const domainBinding = resolveHiveWriterDomainBinding({ artifact, projection });
    const queued = buildHiveWriterShadowMarkerRecord({
      writerRunId: RUN_A,
      status: "queued",
      idempotencyKey: bindingKeyForArtifact(artifact),
      projection,
      projectionHash: domainBinding.reportProjectionContentSha256,
      errorCodes: ["QUEUED"],
      message: null,
    });
    await gateway.uploadObject(
      "document-pages",
      hiveWriterShadowRecordPath(OWNER, artifact.studyRunId, "customer", RUN_A),
      new TextEncoder().encode(JSON.stringify(queued)),
    );
    const record = await executeHiveWriterShadowRequest({
      claimedUserId: OWNER,
      caseId: artifact.caseId,
      studyRunId: artifact.studyRunId,
      audience: "customer",
      writerRunId: RUN_A,
      env: { HIVE_AGENTS_HOST: "127.0.0.1" },
      gateway,
      loadArtifact: async () => artifact,
      invokeWriter,
    });
    expect(record.status).toBe("failed");
    expect(record.validation.errorCodes).toContain("WRITER_SHADOW_PUBLICATION_BLOCKED");
    expect(invokeWriter).not.toHaveBeenCalled();
  });

  it("calls Writer once per writerRunId and reuses on duplicate delivery", async () => {
    const artifact = sampleArtifact();
    const invokeWriter = vi.fn(writerFromArtifact(artifact));
    const gateway = memoryGateway(OWNER);
    const dispatch = vi.fn(async () => {});
    const enqueued = await enqueueHiveWriterShadowPreviewRequest({
      claimedUserId: OWNER,
      caseId: artifact.caseId,
      studyRunId: artifact.studyRunId,
      audience: "customer",
      env: {},
      gateway,
      loadArtifact: async () => artifact,
      dispatchRequested: dispatch,
      createWriterRunId: () => RUN_A,
    });
    expect(enqueued.writerRunId).toBe(RUN_A);
    const first = await executeHiveWriterShadowRequest({
      claimedUserId: OWNER,
      caseId: artifact.caseId,
      studyRunId: artifact.studyRunId,
      audience: "customer",
      writerRunId: RUN_A,
      env: {},
      gateway,
      loadArtifact: async () => artifact,
      invokeWriter,
    });
    const second = await executeHiveWriterShadowRequest({
      claimedUserId: OWNER,
      caseId: artifact.caseId,
      studyRunId: artifact.studyRunId,
      audience: "customer",
      writerRunId: RUN_A,
      env: {},
      gateway,
      loadArtifact: async () => artifact,
      invokeWriter,
    });
    expect(first.status).toBe("accepted");
    expect(second.status).toBe("accepted");
    expect(invokeWriter).toHaveBeenCalledTimes(1);
  });

  it("creates independent runs on each explicit enqueue", async () => {
    const artifact = sampleArtifact();
    const gateway = memoryGateway(OWNER);
    const dispatchRequested = vi.fn(async () => {});
    let next = 0;
    const runIds = [RUN_A, RUN_B];
    const first = await enqueueHiveWriterShadowPreviewRequest({
      claimedUserId: OWNER,
      caseId: artifact.caseId,
      studyRunId: artifact.studyRunId,
      audience: "customer",
      env: {},
      gateway,
      loadArtifact: async () => artifact,
      dispatchRequested,
      createWriterRunId: () => runIds[next++]!,
    });
    const second = await enqueueHiveWriterShadowPreviewRequest({
      claimedUserId: OWNER,
      caseId: artifact.caseId,
      studyRunId: artifact.studyRunId,
      audience: "customer",
      env: {},
      gateway,
      loadArtifact: async () => artifact,
      dispatchRequested,
      createWriterRunId: () => runIds[next++]!,
    });
    expect(first.writerRunId).toBe(RUN_A);
    expect(second.writerRunId).toBe(RUN_B);
    expect(first.idempotencyKey).toBe(second.idempotencyKey);
    expect(dispatchRequested).toHaveBeenCalledTimes(2);
    const pathA = hiveWriterShadowRecordPath(OWNER, artifact.studyRunId, "customer", RUN_A);
    const pathB = hiveWriterShadowRecordPath(OWNER, artifact.studyRunId, "customer", RUN_B);
    expect(gateway.objects.has(pathA)).toBe(true);
    expect(gateway.objects.has(pathB)).toBe(true);
  });

  it("keeps the prior accepted run when a later run fails", async () => {
    const artifact = sampleArtifact();
    const gateway = memoryGateway(OWNER);
    const goodWriter = vi.fn(writerFromArtifact(artifact));
    const enqueuedGood = await enqueueHiveWriterShadowPreviewRequest({
      claimedUserId: OWNER,
      caseId: artifact.caseId,
      studyRunId: artifact.studyRunId,
      audience: "customer",
      env: {},
      gateway,
      loadArtifact: async () => artifact,
      dispatchRequested: vi.fn(async () => {}),
      createWriterRunId: () => RUN_A,
    });
    const accepted = await executeHiveWriterShadowRequest({
      claimedUserId: OWNER,
      caseId: artifact.caseId,
      studyRunId: artifact.studyRunId,
      audience: "customer",
      writerRunId: enqueuedGood.writerRunId,
      env: {},
      gateway,
      loadArtifact: async () => artifact,
      invokeWriter: goodWriter,
    });
    expect(accepted.status).toBe("accepted");

    await enqueueHiveWriterShadowPreviewRequest({
      claimedUserId: OWNER,
      caseId: artifact.caseId,
      studyRunId: artifact.studyRunId,
      audience: "customer",
      env: {},
      gateway,
      loadArtifact: async () => artifact,
      dispatchRequested: vi.fn(async () => {}),
      createWriterRunId: () => RUN_B,
    });
    const badWriter = vi.fn(async () => {
      throw new Error("WRITER_HTTP_500:{\"detail\":{\"error\":{\"code\":\"WRITER_PROVIDER_HTTP_5XX\"}}}");
    });
    const failed = await executeHiveWriterShadowRequest({
      claimedUserId: OWNER,
      caseId: artifact.caseId,
      studyRunId: artifact.studyRunId,
      audience: "customer",
      writerRunId: RUN_B,
      env: {},
      gateway,
      loadArtifact: async () => artifact,
      invokeWriter: badWriter,
    });
    expect(failed.status).toBe("failed");
    const pointerPath = hiveWriterShadowLatestAcceptedPath(OWNER, artifact.studyRunId, "customer");
    const pointer = JSON.parse(new TextDecoder().decode(gateway.objects.get(pointerPath)!));
    expect(pointer.writerRunId).toBe(RUN_A);
    const acceptedPath = hiveWriterShadowRecordPath(OWNER, artifact.studyRunId, "customer", RUN_A);
    const stillAccepted = JSON.parse(new TextDecoder().decode(gateway.objects.get(acceptedPath)!));
    expect(stillAccepted.status).toBe("accepted");
  });

  it("separates customer and pro runs", async () => {
    const artifact = sampleArtifact();
    const gateway = memoryGateway(OWNER);
    const dispatchRequested = vi.fn(async () => {});
    await enqueueHiveWriterShadowPreviewRequest({
      claimedUserId: OWNER,
      caseId: artifact.caseId,
      studyRunId: artifact.studyRunId,
      audience: "customer",
      env: {},
      gateway,
      loadArtifact: async () => artifact,
      dispatchRequested,
      createWriterRunId: () => RUN_A,
    });
    await enqueueHiveWriterShadowPreviewRequest({
      claimedUserId: OWNER,
      caseId: artifact.caseId,
      studyRunId: artifact.studyRunId,
      audience: "pro",
      env: {},
      gateway,
      loadArtifact: async () => artifact,
      dispatchRequested,
      createWriterRunId: () => RUN_C,
    });
    expect(
      gateway.objects.has(hiveWriterShadowRecordPath(OWNER, artifact.studyRunId, "customer", RUN_A)),
    ).toBe(true);
    expect(
      gateway.objects.has(hiveWriterShadowRecordPath(OWNER, artifact.studyRunId, "pro", RUN_C)),
    ).toBe(true);
  });
});

describe("enqueueHiveWriterShadowPreviewRequest", () => {
  it("persists queued and dispatches with writerRunId", async () => {
    const artifact = sampleArtifact();
    const gateway = memoryGateway(OWNER);
    const dispatchRequested = vi.fn(async () => {});
    const record = await enqueueHiveWriterShadowPreviewRequest({
      claimedUserId: OWNER,
      caseId: artifact.caseId,
      studyRunId: artifact.studyRunId,
      audience: "customer",
      env: { VERCEL_ENV: "preview" },
      gateway,
      loadArtifact: async () => artifact,
      dispatchRequested,
      createWriterRunId: () => RUN_A,
    });
    expect(record.status).toBe("queued");
    expect(record.writerRunId).toBe(RUN_A);
    expect(dispatchRequested).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: OWNER,
        caseId: artifact.caseId,
        studyRunId: artifact.studyRunId,
        audience: "customer",
        writerRunId: RUN_A,
      }),
    );
  });

  it("reads legacy binding-path accepted records via latest-accepted migration fallback", async () => {
    const artifact = sampleArtifact();
    const gateway = memoryGateway(OWNER);
    const bindingKey = bindingKeyForArtifact(artifact);
    const projection = projectCanonicalStudyReport({
      artifact,
      audience: "customer",
      customerProReportsPermitted: false,
      packApprovalLabel: CANONICAL_STUDY_DEBUG_PACK_APPROVAL,
    });
    const domainBinding = resolveHiveWriterDomainBinding({ artifact, projection });
    const legacyAccepted = {
      ...buildHiveWriterShadowMarkerRecord({
        writerRunId: RUN_A,
        status: "queued",
        idempotencyKey: bindingKey,
        projection,
        projectionHash: domainBinding.reportProjectionContentSha256,
        errorCodes: [],
        message: null,
      }),
      status: "accepted" as const,
      hiveUiTree: buildDeterministicHiveUiTree(projection),
      proposal: (await writerFromArtifact(artifact)({} as never)).proposal,
      validation: { ok: true, errorCodes: [], message: null },
    };
    const legacyPath = hiveWriterShadowLegacyBindingRecordPath(
      OWNER,
      artifact.studyRunId,
      "customer",
      bindingKey,
    );
    await gateway.uploadObject(
      "document-pages",
      legacyPath,
      new TextEncoder().encode(JSON.stringify(legacyAccepted)),
    );
    const { loadLatestAcceptedWriterShadowRecord } = await import("./execute-hive-writer-shadow.js");
    const loaded = await loadLatestAcceptedWriterShadowRecord({
      gateway,
      bucket: "document-pages",
      userId: OWNER,
      studyRunId: artifact.studyRunId,
      audience: "customer",
      projectionBindingKey: bindingKey,
    });
    expect(loaded?.status).toBe("accepted");
    expect(loaded?.writerRunId).toBe(RUN_A);
  });
});
