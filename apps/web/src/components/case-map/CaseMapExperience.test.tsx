import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { l001LikeCanonicalSnapshot } from "@hiveforyou/core";

import type { CaseMapViewBundle } from "@/lib/case-map/case-map-view-bundle";
import { l001CaseMapViewFixture } from "@/lib/case-map/fixtures/l001-case-map-fixture";

import { CaseMapExperience } from "./CaseMapExperience";
import { CaseMapOutline } from "./CaseMapOutline";

vi.mock("@/lib/case-map/case-map-client", () => ({
  fetchCaseMapViewBundle: vi.fn(),
}));

vi.mock("@/lib/evidence/evidence-trace-client", () => ({
  fetchEvidenceTrace: vi.fn(),
}));

vi.mock("@/lib/case-map/use-media-query", () => ({
  useMediaQuery: () => false,
}));

import { fetchCaseMapViewBundle } from "@/lib/case-map/case-map-client";
import { fetchEvidenceTrace } from "@/lib/evidence/evidence-trace-client";

function readyBundle(status: CaseMapViewBundle["status"] = "SUCCEEDED"): CaseMapViewBundle {
  const { caseMap, provenance, proView } = l001CaseMapViewFixture();
  return {
    studyRunId: "l001-run",
    caseId: "l001-case",
    status,
    caseMap,
    provenance,
    proView,
    caseView: null,
    canonicalSnapshot: l001LikeCanonicalSnapshot(),
  };
}

describe("CaseMapExperience", () => {
  beforeEach(() => {
    vi.mocked(fetchCaseMapViewBundle).mockReset();
    vi.mocked(fetchEvidenceTrace).mockReset();
  });

  it("renders READY living case map with root and zones", async () => {
    vi.mocked(fetchCaseMapViewBundle).mockResolvedValue(readyBundle());
    render(<CaseMapExperience studyRunId="l001-run" initialBundle={readyBundle()} />);
    await waitFor(() => {
      expect(screen.getByTestId("case-map-experience")).toBeInTheDocument();
    });
    expect(screen.getByTestId("living-case-map")).toBeInTheDocument();
    expect(screen.getByText("Your case, understood.")).toBeInTheDocument();
    expect(screen.getByTestId("case-map-overview")).toBeInTheDocument();
  });

  it("shows STUDYING state while run is RUNNING", async () => {
    vi.mocked(fetchCaseMapViewBundle).mockResolvedValue({
      ...readyBundle(),
      status: "RUNNING",
      caseMap: null,
      provenance: null,
      proView: null,
      canonicalSnapshot: null,
    });
    render(<CaseMapExperience studyRunId="l001-run" />);
    await waitFor(() => {
      expect(screen.getByTestId("case-map-studying")).toBeInTheDocument();
    });
    expect(screen.getByTestId("case-map-studying-message")).toHaveTextContent(
      /Understanding the case|Connecting the evidence/,
    );
  });

  it("shows FAILED state with recoverable copy", async () => {
    vi.mocked(fetchCaseMapViewBundle).mockResolvedValue({
      ...readyBundle("FAILED"),
      caseMap: null,
      provenance: null,
      proView: null,
      canonicalSnapshot: null,
    });
    render(<CaseMapExperience studyRunId="l001-run" />);
    await waitFor(() => {
      expect(screen.getByTestId("case-map-failed")).toBeInTheDocument();
    });
    expect(screen.queryByText(/OpenAI|Engine 2|canonical study/i)).not.toBeInTheDocument();
  });

  it("promotes attention when NEEDS_REVIEW", async () => {
    const bundle = readyBundle("NEEDS_REVIEW");
    render(<CaseMapExperience studyRunId="l001-run" initialBundle={bundle} />);
    await waitFor(() => {
      expect(screen.getAllByTestId("case-map-attention").length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/needs attention/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Needs your input/i)).not.toBeInTheDocument();
  });

  it("renders ghost nodes from projection", async () => {
    render(<CaseMapExperience studyRunId="l001-run" initialBundle={readyBundle()} />);
    await waitFor(() => {
      expect(screen.getByTestId("living-case-map")).toBeInTheDocument();
    });
    expect(
      screen.getAllByTestId("case-map-node-ghost").length,
    ).toBeGreaterThan(0);
  });

  it("shows conflict card when attention references conflict", async () => {
    const user = userEvent.setup();
    render(
      <CaseMapExperience studyRunId="l001-run" initialBundle={readyBundle("NEEDS_REVIEW")} />,
    );
    await user.click(screen.getAllByTestId("case-map-attention")[0]!);
    await waitFor(() => {
      expect(screen.getByTestId("case-map-conflict")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /Use 42%/i })).not.toBeInTheDocument();
  });

  it("supports progressive disclosure by opening a zone", async () => {
    const user = userEvent.setup();
    render(<CaseMapExperience studyRunId="l001-run" initialBundle={readyBundle()} />);
    await user.click(screen.getByRole("button", { name: /Goals/i }));
    expect(screen.getByTestId("case-map-zone-focus")).toBeInTheDocument();
    expect(screen.getAllByTestId("case-map-node-construct").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("case-map-node-fact").length).toBeGreaterThan(0);
  });

  it("opens evidence trace from a fact via conflict evidence button", async () => {
    vi.mocked(fetchEvidenceTrace).mockResolvedValue({
      id: "ev-svc",
      sourceDocumentId: "src-iep",
      logicalDocumentId: "ld-iep",
      sourceType: "document",
      page: 8,
      sourceFilename: "iep.pdf",
      resolution: "EXACT",
      canonicalTextSnippet: "120 minutes",
    });
    const user = userEvent.setup();
    render(
      <CaseMapExperience studyRunId="l001-run" initialBundle={readyBundle("NEEDS_REVIEW")} />,
    );
    await user.click(screen.getAllByTestId("case-map-attention")[0]!);
    await waitFor(() => {
      expect(screen.getByTestId("case-map-conflict")).toBeInTheDocument();
    });
    const buttons = within(screen.getByTestId("case-map-conflict")).getAllByText("Evidence");
    fireEvent.click(buttons[0]!);
    await waitFor(() => {
      expect(screen.getByTestId("evidence-drawer")).toBeInTheDocument();
    });
    expect(fetchEvidenceTrace).toHaveBeenCalled();
  });

  it("renders chronology from projection", async () => {
    render(<CaseMapExperience studyRunId="l001-run" initialBundle={readyBundle()} />);
    await waitFor(() => {
      expect(screen.getByTestId("case-map-chronology")).toBeInTheDocument();
    });
    expect(screen.getAllByTestId("case-map-chronology-item").length).toBe(2);
  });

  it("switches between map and outline modes", async () => {
    render(<CaseMapExperience studyRunId="l001-run" initialBundle={readyBundle()} />);
    await waitFor(() => {
      expect(screen.getByTestId("living-case-map")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("case-map-view-outline"));
    expect(screen.getByTestId("case-map-outline")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("case-map-view-map"));
    expect(screen.getByTestId("living-case-map")).toBeInTheDocument();
  });

  it("outline shares structure with map data", () => {
    const { caseMap } = l001CaseMapViewFixture();
    render(
      <CaseMapOutline
        map={caseMap}
        expandedNodeIds={new Set([caseMap.rootNodeId])}
        selectedNodeId={null}
        attentionItems={caseMap.attention}
        onToggleExpand={() => {}}
        onSelectNode={() => {}}
        onOpenFactEvidence={() => {}}
      />,
    );
    expect(screen.getByTestId("case-map-outline")).toBeInTheDocument();
    expect(screen.getAllByTestId("outline-node-zone").length).toBeGreaterThan(0);
  });

  it("does not embed IEP-specific literals in generic map shell copy", async () => {
    render(<CaseMapExperience studyRunId="l001-run" initialBundle={readyBundle()} />);
    await waitFor(() => {
      expect(screen.getByTestId("case-map-experience")).toBeInTheDocument();
    });
    const shell = screen.getByTestId("case-map-experience").textContent ?? "";
    expect(shell).not.toMatch(/\bReact Flow\b/);
    expect(shell).not.toContain("Individualized Education Program");
    expect(shell).not.toContain("VIEW STATE");
    expect(shell).not.toContain("Leo R.");
    expect(shell).not.toContain("CAN-9204");
    expect(shell).not.toMatch(/SHA-256/);
    expect(shell).not.toMatch(/0% AI hallucination/i);
  });

  it("walks overview, zone, finding, evidence, and back", async () => {
    vi.mocked(fetchEvidenceTrace).mockResolvedValue({
      id: "ev-goal",
      sourceDocumentId: "src-iep",
      logicalDocumentId: "ld-iep",
      sourceType: "document",
      page: 6,
      physicalPageNumber: 6,
      logicalPageNumber: 2,
      sourceFilename: "iep.pdf",
      sha256: "abc123hidden",
      resolution: "EXACT",
      canonicalTextSnippet: "Improve decoding fluency",
      region: {
        x: 1,
        y: 2,
        width: 3,
        height: 4,
        coordinateSpace: "source-document-page",
      },
    });
    const user = userEvent.setup();
    render(<CaseMapExperience studyRunId="l001-run" initialBundle={readyBundle()} />);
    await user.click(screen.getByRole("button", { name: /Goals/i }));
    await user.click(screen.getAllByTestId("case-map-node-fact")[0]!);
    expect(screen.getByTestId("case-map-fact-focus")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("evidence-match")).toHaveTextContent("Exact");
    });
    expect(screen.getByText("iep.pdf")).toBeInTheDocument();
    expect(screen.getByText(/6 · 2 in the document/)).toBeInTheDocument();
    expect(screen.queryByText(/SHA-256/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("evidence-region")).not.toBeInTheDocument();
    expect(screen.queryByText("abc123hidden")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByTestId("case-map-zone-focus")).toBeInTheDocument();
    expect(screen.queryByTestId("evidence-drawer")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("case-map-back"));
    expect(screen.getByTestId("case-map-overview")).toBeInTheDocument();
  });
});
