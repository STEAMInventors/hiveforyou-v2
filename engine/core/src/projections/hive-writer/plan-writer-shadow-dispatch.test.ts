import { describe, expect, it } from "vitest";

import { parseHiveWriterShadowRecord } from "@hiveforyou/shared/hive-writer-proposal";

import { assertWriterShadowOwner, WriterShadowOwnerError } from "./assert-writer-shadow-owner.js";
import { assertHiveWriterLoopbackHost } from "./create-writer-http-client.js";
import {
  planWriterShadowPreviewRequest,
  planWriterShadowWorkerExecution,
} from "./plan-writer-shadow-dispatch.js";
import { buildHiveWriterShadowMarkerRecord } from "./run-hive-writer-shadow.js";
import { projectCanonicalStudyReport } from "../project-canonical-study-report.js";
import { buildSyntheticFoundation, mockPages, planGoalDoc, SYNTHETIC_PACK } from "../../study/canonical-study/test-fixtures.js";
import { buildCanonicalStudy } from "../../study/canonical-study/index.js";
import { CANONICAL_STUDY_DEBUG_PACK_APPROVAL } from "../../study/resolve-approved-proposal-domain-pack.js";

const PACK_SHA = "a".repeat(64);

function projection() {
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
  return projectCanonicalStudyReport({
    artifact,
    audience: "customer",
    customerProReportsPermitted: false,
    packApprovalLabel: CANONICAL_STUDY_DEBUG_PACK_APPROVAL,
  });
}

describe("planWriterShadowPreviewRequest", () => {
  it("does not enqueue when production or the shadow flag is off", () => {
    expect(
      planWriterShadowPreviewRequest({
        shadowModeEnabled: true,
        vercelEnv: "production",
        presentationMode: "internal_preview",
        existingStatus: null,
      }).action,
    ).toBe("skip_disabled");
    expect(
      planWriterShadowPreviewRequest({
        shadowModeEnabled: false,
        vercelEnv: "preview",
        presentationMode: "internal_preview",
        existingStatus: null,
      }).action,
    ).toBe("skip_disabled");
  });

  it("reuses an accepted record and resends only while in flight", () => {
    expect(
      planWriterShadowPreviewRequest({
        shadowModeEnabled: true,
        vercelEnv: "preview",
        presentationMode: "internal_preview",
        existingStatus: "accepted",
      }),
    ).toEqual({ action: "return_existing", resend: false });
    expect(
      planWriterShadowPreviewRequest({
        shadowModeEnabled: true,
        vercelEnv: "preview",
        presentationMode: "internal_preview",
        existingStatus: "queued",
      }),
    ).toEqual({ action: "return_existing", resend: true });
  });

  it("blocks approved presentation before enqueue", () => {
    expect(
      planWriterShadowPreviewRequest({
        shadowModeEnabled: true,
        vercelEnv: "preview",
        presentationMode: "approved",
        existingStatus: null,
      }).action,
    ).toBe("block_publication");
  });
});

describe("planWriterShadowWorkerExecution", () => {
  it("reuses terminal records and invokes only for internal preview when enabled", () => {
    expect(
      planWriterShadowWorkerExecution({
        shadowModeEnabled: true,
        presentationMode: "internal_preview",
        existingStatus: "accepted",
      }),
    ).toBe("reuse");
    expect(
      planWriterShadowWorkerExecution({
        shadowModeEnabled: false,
        presentationMode: "internal_preview",
        existingStatus: null,
      }),
    ).toBe("skip_disabled");
    expect(
      planWriterShadowWorkerExecution({
        shadowModeEnabled: true,
        presentationMode: "approved",
        existingStatus: null,
      }),
    ).toBe("block_publication");
    expect(
      planWriterShadowWorkerExecution({
        shadowModeEnabled: true,
        presentationMode: "internal_preview",
        existingStatus: "processing",
      }),
    ).toBe("invoke");
  });
});

describe("assertWriterShadowOwner", () => {
  it("returns the persisted owner only when the claim, study, and case agree", () => {
    expect(
      assertWriterShadowOwner({
        claimedUserId: "user-a",
        caseId: "case-1",
        persistedStudy: { userId: "user-a", caseId: "case-1" },
        persistedCase: { userId: "user-a" },
      }),
    ).toEqual({ userId: "user-a" });
  });

  it("does not accept an event user id that differs from the persisted owner", () => {
    expect(() =>
      assertWriterShadowOwner({
        claimedUserId: "user-b",
        caseId: "case-1",
        persistedStudy: { userId: "user-a", caseId: "case-1" },
        persistedCase: { userId: "user-a" },
      }),
    ).toThrow(WriterShadowOwnerError);
  });

  it("fails closed when the study or case row is missing", () => {
    expect(() =>
      assertWriterShadowOwner({
        claimedUserId: "user-a",
        caseId: "case-1",
        persistedStudy: null,
        persistedCase: { userId: "user-a" },
      }),
    ).toThrow(WriterShadowOwnerError);
  });
});

describe("assertHiveWriterLoopbackHost", () => {
  it("defaults to loopback and rejects a public host", () => {
    expect(assertHiveWriterLoopbackHost({})).toBe("127.0.0.1");
    expect(() => assertHiveWriterLoopbackHost({ HIVE_AGENTS_HOST: "writer.example.com" })).toThrow(
      "WRITER_HOST_NOT_LOOPBACK",
    );
  });
});

describe("buildHiveWriterShadowMarkerRecord", () => {
  it("round-trips a queued record through the shadow schema", () => {
    const report = projection();
    const record = buildHiveWriterShadowMarkerRecord({
      status: "queued",
      idempotencyKey: "d".repeat(64),
      projection: report,
      projectionHash: "e".repeat(64),
      errorCodes: ["QUEUED"],
      message: null,
    });
    expect(parseHiveWriterShadowRecord(record).status).toBe("queued");
  });
});
