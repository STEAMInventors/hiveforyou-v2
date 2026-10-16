import { describe, expect, it } from "vitest";

import { parseHiveWriterShadowRecord } from "@hiveforyou/shared/hive-writer-proposal";

import { assertWriterShadowOwner, WriterShadowOwnerError } from "./assert-writer-shadow-owner.js";
import { assertHiveWriterLoopbackHost } from "./create-writer-http-client.js";
import {
  shouldBlockWriterShadowPublication,
  shouldInvokeWriterRun,
  shouldReuseWriterRunRecord,
} from "./plan-writer-shadow-dispatch.js";
import { buildHiveWriterShadowMarkerRecord } from "./run-hive-writer-shadow.js";
import { projectCanonicalStudyReport } from "../project-canonical-study-report.js";
import { buildSyntheticFoundation, mockPages, planGoalDoc, SYNTHETIC_PACK } from "../../study/canonical-study/test-fixtures.js";
import { buildCanonicalStudy } from "../../study/canonical-study/index.js";
import { CANONICAL_STUDY_DEBUG_PACK_APPROVAL } from "../../study/resolve-approved-proposal-domain-pack.js";

const PACK_SHA = "a".repeat(64);
const WRITER_RUN_ID = "11111111-1111-4111-8111-111111111111";

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

describe("writer run dispatch helpers", () => {
  it("blocks approved presentation before enqueue", () => {
    expect(shouldBlockWriterShadowPublication("approved")).toBe(true);
    expect(shouldBlockWriterShadowPublication("internal_preview")).toBe(false);
  });

  it("reuses terminal and processing runs but invokes only from queued", () => {
    expect(shouldReuseWriterRunRecord("accepted")).toBe(true);
    expect(shouldReuseWriterRunRecord("failed")).toBe(true);
    expect(shouldReuseWriterRunRecord("processing")).toBe(true);
    expect(shouldReuseWriterRunRecord("queued")).toBe(false);
    expect(shouldReuseWriterRunRecord(null)).toBe(false);
    expect(shouldInvokeWriterRun("queued")).toBe(true);
    expect(shouldInvokeWriterRun("processing")).toBe(false);
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
      writerRunId: WRITER_RUN_ID,
      status: "queued",
      idempotencyKey: "d".repeat(64),
      projection: report,
      projectionHash: "e".repeat(64),
      errorCodes: ["QUEUED"],
      message: null,
    });
    expect(parseHiveWriterShadowRecord(record).status).toBe("queued");
    expect(parseHiveWriterShadowRecord(record).writerRunId).toBe(WRITER_RUN_ID);
  });
});
