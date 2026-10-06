import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ShadowFindingsPanel } from "./ShadowFindingsPanel";

describe("ShadowFindingsPanel", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ artifact: null }),
      }),
    );
  });

  it("shows empty state when no shadow artifact exists", async () => {
    render(<ShadowFindingsPanel caseId="case-1" studyRunId="run-1" />);
    await waitFor(() => {
      expect(screen.getByText(/Shadow study not run for this study run/i)).toBeInTheDocument();
    });
  });

  it("shows coverage when shadow study succeeded", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        artifact: {
          status: "succeeded",
          failed_step: null,
          findings_json: [],
          coverage_json: { covered: 36, total: 37, uncoveredClaims: [] },
          statements_count: 10,
          facts_count: 5,
          multi_source_facts_count: 2,
          drops_json: null,
          token_usage_json: null,
          started_at: "2026-01-01T00:00:00.000Z",
          completed_at: "2026-01-01T00:05:00.000Z",
        },
      }),
    } as Response);

    render(<ShadowFindingsPanel caseId="case-1" studyRunId="run-1" />);
    await waitFor(() => {
      expect(screen.getByText(/v4 coverage: 36\/37/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Status:/i)).toHaveTextContent("succeeded");
  });

  it("shows failed step when shadow study failed", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        artifact: {
          status: "failed",
          failed_step: "shadow-tier1",
          findings_json: [],
          coverage_json: null,
          statements_count: 0,
          facts_count: 0,
          multi_source_facts_count: 0,
          drops_json: null,
          token_usage_json: null,
          started_at: "2026-01-01T00:00:00.000Z",
          completed_at: "2026-01-01T00:01:00.000Z",
        },
      }),
    } as Response);

    render(<ShadowFindingsPanel caseId="case-1" studyRunId="run-1" />);
    await waitFor(() => {
      expect(screen.getByText(/failed at shadow-tier1/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Status:/i)).toHaveTextContent("failed");
  });
});