import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { EvidenceDrawer } from "./EvidenceDrawer";

vi.mock("@/lib/evidence/evidence-trace-client", () => ({
  fetchEvidenceTrace: vi.fn(),
}));

import { fetchEvidenceTrace } from "@/lib/evidence/evidence-trace-client";

describe("EvidenceDrawer", () => {
  beforeEach(() => {
    vi.mocked(fetchEvidenceTrace).mockReset();
  });

  it("loads and renders exact extracted snippet with span highlight", async () => {
    vi.mocked(fetchEvidenceTrace).mockResolvedValue({
      id: "ev-1",
      sourceDocumentId: "src-1",
      sourceType: "document",
      logicalDocumentId: "ld-1",
      physicalPageNumber: 5,
      logicalPageNumber: 2,
      sourceFilename: "packet.pdf",
      resolution: "EXACT",
      canonicalTextSnippet: "Annual measurable goal: reading fluency",
      span: { start: 0, end: 6 },
      region: {
        x: 10,
        y: 680,
        width: 420,
        height: 12,
        coordinateSpace: "source-document-page",
      },
    });

    render(
      <EvidenceDrawer
        studyRunId="run-1"
        claimStatement="A reading goal is documented."
        evidence={[
          {
            id: "ev-1",
            sourceDocumentId: "src-1",
            sourceType: "document",
            logicalDocumentId: "ld-1",
          },
        ]}
        onClose={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("measurable goal: reading fluency")).toBeInTheDocument();
    });
    expect(screen.getByText("Annual")).toBeInTheDocument();
    expect(screen.getByTestId("evidence-region")).toHaveTextContent("Region");
    expect(fetchEvidenceTrace).toHaveBeenCalledWith({
      studyRunId: "run-1",
      evidenceRefId: "ev-1",
    });
    const openDoc = screen.getByTestId("evidence-open-full-page");
    expect(openDoc).toHaveAttribute(
      "href",
      "/api/study/runs/run-1/sources/src-1/file#page=5",
    );
  });
});
