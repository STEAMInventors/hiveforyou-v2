import { beforeEach, describe, expect, it, vi } from "vitest";

import { UnauthenticatedError } from "@hiveforyou/core";

vi.mock("@/lib/preview/hive-debug-server", () => ({
  denyUnlessHiveDebugRoutesEnabled: vi.fn(),
}));

vi.mock("@/lib/auth/require-case-access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/require-case-access")>();
  return {
    ...actual,
    requireCaseAccess: vi.fn(),
    requireAdmin: vi.fn(),
  };
});

vi.mock("@/lib/case/case-bundle-service-server", () => ({
  loadCaseViewBundle: vi.fn(),
}));

vi.mock("@/lib/canonical-debug/run-deterministic-canonical-study-server", () => ({
  loadDeterministicCanonicalStudyArtifact: vi.fn(),
  runDeterministicCanonicalStudy: vi.fn(),
  CanonicalStudyArtifactsNotFoundError: class CanonicalStudyArtifactsNotFoundError extends Error {},
  PackNotAvailableError: class PackNotAvailableError extends Error {},
  SourcePagesUnavailableError: class SourcePagesUnavailableError extends Error {},
}));

import { GET as getBundle } from "./[caseId]/bundle/route";
import { GET as getCanonicalDebug } from "./[caseId]/canonical-debug/route";
import { POST as postCanonicalStudyRun } from "./[caseId]/canonical-study/run/route";
import {
  ForbiddenError,
  requireAdmin,
  requireCaseAccess,
} from "@/lib/auth/require-case-access";
import { denyUnlessHiveDebugRoutesEnabled } from "@/lib/preview/hive-debug-server";

const CASE_ID = "14baf227-7067-4a84-a316-f6cb72a5ecfe";

describe("case data route auth", () => {
  beforeEach(() => {
    vi.mocked(requireCaseAccess).mockReset();
    vi.mocked(requireAdmin).mockReset();
    vi.mocked(denyUnlessHiveDebugRoutesEnabled).mockReset();
    delete process.env.HIVE_ENABLE_DEBUG_ROUTES;
    vi.mocked(denyUnlessHiveDebugRoutesEnabled).mockReturnValue(null);
  });

  it("returns 401 on bundle GET without session", async () => {
    vi.mocked(requireCaseAccess).mockRejectedValue(new UnauthenticatedError());
    const response = await getBundle(
      new Request(`http://localhost/api/case/${CASE_ID}/bundle`),
      { params: Promise.resolve({ caseId: CASE_ID }) },
    );
    expect(response.status).toBe(401);
  });

  it("returns 404 on canonical-debug GET when debug routes are disabled", async () => {
    vi.mocked(denyUnlessHiveDebugRoutesEnabled).mockReturnValue(
      new Response(null, { status: 404 }),
    );
    const response = await getCanonicalDebug(
      new Request(
        `http://localhost/api/case/${CASE_ID}/canonical-debug?studyRunId=86dfa706-f7fc-4fe7-a49d-14e154825ec4`,
      ),
      { params: Promise.resolve({ caseId: CASE_ID }) },
    );
    expect(response.status).toBe(404);
  });

  it("returns 401 on canonical-study/run POST without session when debug enabled", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "admin" } });
    vi.mocked(requireCaseAccess).mockRejectedValue(new UnauthenticatedError());
    const response = await postCanonicalStudyRun(
      new Request(`http://localhost/api/case/${CASE_ID}/canonical-study/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studyRunId: "86dfa706-f7fc-4fe7-a49d-14e154825ec4" }),
      }),
      { params: Promise.resolve({ caseId: CASE_ID }) },
    );
    expect(response.status).toBe(401);
  });

  it("returns 403 on debug route when debug enabled but caller is not admin", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new ForbiddenError());
    const response = await getCanonicalDebug(
      new Request(
        `http://localhost/api/case/${CASE_ID}/canonical-debug?studyRunId=86dfa706-f7fc-4fe7-a49d-14e154825ec4`,
      ),
      { params: Promise.resolve({ caseId: CASE_ID }) },
    );
    expect(response.status).toBe(403);
  });
});
