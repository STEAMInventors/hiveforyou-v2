import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/canonical-report/canonical-report-service-server", () => ({
  loadCanonicalStudyReportProjectionForSession: vi.fn(),
}));

vi.mock("@/lib/hive-writer/hive-writer-shadow-service-server", () => ({
  loadWriterHiveUiTreePreviewForSession: vi.fn(),
  runHiveWriterShadowForSession: vi.fn(),
}));

import { GET as getCanonicalReport } from "@/app/api/case/[caseId]/canonical-report/route";
import { GET as getUiTree } from "@/app/api/case/[caseId]/hive-writer-shadow/ui-tree/route";
import { POST as postWriterShadowRun } from "@/app/api/case/[caseId]/hive-writer-shadow/run/route";
import { loadCanonicalStudyReportProjectionForSession } from "@/lib/canonical-report/canonical-report-service-server";
import {
  loadWriterHiveUiTreePreviewForSession,
  runHiveWriterShadowForSession,
} from "@/lib/hive-writer/hive-writer-shadow-service-server";

const LEAK = 'LEAKED_QUOTE: "Student must receive 120 minutes of SLP"';

function sensitiveError(): Error & { errorCode: string } {
  const err = new Error(LEAK) as Error & { errorCode: string };
  err.errorCode = "INTERNAL_PROJECTION_FAULT";
  err.stack = `Error: ${LEAK}\n    at load (/app/service.ts:10:5)`;
  return err;
}

describe("Phase 8.6 case projection routes — sanitized 500 responses", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(loadCanonicalStudyReportProjectionForSession).mockReset();
    vi.mocked(loadWriterHiveUiTreePreviewForSession).mockReset();
    vi.mocked(runHiveWriterShadowForSession).mockReset();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("canonical-report GET returns generic 500 JSON and logs safe fields only", async () => {
    vi.mocked(loadCanonicalStudyReportProjectionForSession).mockRejectedValue(sensitiveError());

    const response = await getCanonicalReport(
      new Request(
        "http://localhost/api/case/case-1/canonical-report?studyRunId=run-1&audience=customer",
      ),
      { params: Promise.resolve({ caseId: "case-1" }) },
    );

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string; message: string };
    expect(body).toEqual({
      error: "UNEXPECTED",
      message: "Could not load canonical study report projection.",
    });
    expect(JSON.stringify(body)).not.toContain("SLP");

    expect(errorSpy).toHaveBeenCalledWith(
      "[api/case/canonical-report] UNEXPECTED",
      expect.objectContaining({
        route: "api/case/canonical-report",
        safeErrorCode: "INTERNAL_PROJECTION_FAULT",
        studyRunId: "run-1",
      }),
    );
    const logPayload = JSON.stringify(errorSpy.mock.calls[0]?.[1]);
    expect(logPayload).not.toContain("SLP");
    expect(logPayload).not.toContain(LEAK);
  });

  it("hive-writer-shadow ui-tree GET returns generic 500 JSON and logs safe fields only", async () => {
    vi.mocked(loadWriterHiveUiTreePreviewForSession).mockRejectedValue(sensitiveError());

    const response = await getUiTree(
      new Request(
        "http://localhost/api/case/case-1/hive-writer-shadow/ui-tree?studyRunId=run-2&audience=pro",
      ),
      { params: Promise.resolve({ caseId: "case-1" }) },
    );

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string; message: string };
    expect(body).toEqual({
      error: "WRITER_UI_TREE_FAILED",
      message: "Could not resolve Writer UI tree preview.",
    });
    expect(JSON.stringify(body)).not.toContain("SLP");

    expect(errorSpy).toHaveBeenCalledWith(
      "[api/case/hive-writer-shadow/ui-tree] UNEXPECTED",
      expect.objectContaining({
        safeErrorCode: "INTERNAL_PROJECTION_FAULT",
        studyRunId: "run-2",
      }),
    );
  });

  it("hive-writer-shadow run POST returns generic 500 JSON and logs safe fields only", async () => {
    vi.mocked(runHiveWriterShadowForSession).mockRejectedValue(sensitiveError());

    const response = await postWriterShadowRun(
      new Request("http://localhost/api/case/case-1/hive-writer-shadow/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studyRunId: "run-3", audience: "customer" }),
      }),
      { params: Promise.resolve({ caseId: "case-1" }) },
    );

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string; message: string };
    expect(body).toEqual({
      error: "WRITER_SHADOW_FAILED",
      message: "Hive Writer shadow run failed.",
    });
    expect(JSON.stringify(body)).not.toContain("SLP");

    expect(errorSpy).toHaveBeenCalledWith(
      "[api/case/hive-writer-shadow/run] UNEXPECTED",
      expect.objectContaining({
        safeErrorCode: "INTERNAL_PROJECTION_FAULT",
        studyRunId: "run-3",
      }),
    );
  });
});
