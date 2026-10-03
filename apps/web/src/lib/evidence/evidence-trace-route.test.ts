import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/evidence/evidence-trace-service-server", () => ({
  resolveEvidenceTraceForStudyRun: vi.fn(),
  StudyRunNotFoundError: class StudyRunNotFoundError extends Error {},
  EvidenceRefNotFoundError: class EvidenceRefNotFoundError extends Error {},
}));

import { GET } from "@/app/api/study/runs/[studyRunId]/evidence/[evidenceRefId]/route";
import { resolveEvidenceTraceForStudyRun } from "@/lib/evidence/evidence-trace-service-server";

describe("GET /api/study/runs/[studyRunId]/evidence/[evidenceRefId]", () => {
  beforeEach(() => {
    vi.mocked(resolveEvidenceTraceForStudyRun).mockReset();
  });

  it("returns resolved evidence trace JSON", async () => {
    vi.mocked(resolveEvidenceTraceForStudyRun).mockResolvedValue({
      id: "ev-1",
      evidenceRefId: "ev-1",
      sourceDocumentId: "src-1",
      sourceType: "document",
      resolution: "EXACT",
      canonicalTextSnippet: "snippet",
    });

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ studyRunId: "run-1", evidenceRefId: "ev-1" }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { evidence: { resolution: string } };
    expect(body.evidence.resolution).toBe("EXACT");
  });
});
