import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { l001LikeCanonicalSnapshot, projectCaseViewV2Minimal } from "@hiveforyou/core";

import type { CaseMapViewBundle } from "@/lib/case-map/case-map-view-bundle";
import { l001CaseMapViewFixture } from "@/lib/case-map/fixtures/l001-case-map-fixture";

import { CaseSummaryExperience } from "./CaseSummaryExperience";

vi.mock("@/lib/case-map/case-map-client", () => ({
  fetchCaseMapViewBundle: vi.fn(),
}));

vi.mock("@/lib/evidence/evidence-trace-client", () => ({
  fetchEvidenceTrace: vi.fn().mockResolvedValue({
    id: "ev-1",
    sourceDocumentId: "src-iep",
    sourceType: "document",
    page: 1,
    sourceFilename: "iep.pdf",
    canonicalTextSnippet: "Sample text",
  }),
}));

vi.mock("@/components/evidence/EvidenceCropPreview", () => ({
  EvidenceCropPreview: () => <div data-testid="case-summary-evidence-crop" />,
}));

vi.mock("@/components/evidence/EvidenceDocumentViewer", () => ({
  EvidenceDocumentViewer: () => <div data-testid="evidence-document-viewer" />,
}));

import { fetchCaseMapViewBundle } from "@/lib/case-map/case-map-client";

function readyBundle(): CaseMapViewBundle {
  const { caseMap, provenance, proView } = l001CaseMapViewFixture();
  const canonicalSnapshot = l001LikeCanonicalSnapshot();
  const caseView = projectCaseViewV2Minimal({ intelligence: canonicalSnapshot, provenance });
  return {
    studyRunId: "l001-run",
    caseId: "l001-case",
    status: "SUCCEEDED",
    caseMap,
    provenance,
    proView,
    caseView,
    canonicalSnapshot,
  };
}

describe("CaseSummaryExperience", () => {
  beforeEach(() => {
    vi.mocked(fetchCaseMapViewBundle).mockReset();
    vi.mocked(fetchCaseMapViewBundle).mockResolvedValue(readyBundle());
  });

  it("renders artifact case summary with status bar and domain pill", async () => {
    render(<CaseSummaryExperience studyRunId="l001-run" initialBundle={readyBundle()} />);
    await waitFor(() => {
      expect(screen.getByTestId("case-summary-experience")).toBeInTheDocument();
    });
    expect(screen.getByText("Special Education / IEP")).toBeInTheDocument();
    expect(screen.getByTestId("case-summary-headline")).toHaveTextContent(/needs you|ready for the meeting/i);
    expect(screen.getByTestId("case-summary-status-bar")).toBeInTheDocument();
    expect(screen.getByTestId("case-summary-change")).toBeInTheDocument();
  });

  it("walks through a decision and shows clear state", async () => {
    render(<CaseSummaryExperience studyRunId="l001-run" initialBundle={readyBundle()} />);
    await waitFor(() => {
      expect(screen.getByTestId("case-summary-ask")).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByTestId("case-summary-decision-option")[0]!);
    await waitFor(() => {
      expect(screen.getByTestId("case-summary-clear")).toBeInTheDocument();
    });
  });

  it("opens artifact evidence panel from a compare chip", async () => {
    render(<CaseSummaryExperience studyRunId="l001-run" initialBundle={readyBundle()} />);
    await waitFor(() => {
      expect(screen.getAllByTestId("case-summary-pair-chip").length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getAllByTestId("case-summary-pair-chip")[0]!);
    await waitFor(() => {
      expect(screen.getByTestId("case-summary-evidence-panel")).toBeInTheDocument();
    });
    const panel = screen.getByTestId("case-summary-evidence-panel");
    expect(within(panel).getAllByTestId("case-summary-view-in-document").length).toBeGreaterThan(0);
    expect(within(panel).getByTestId("case-summary-open-both-side-by-side")).toBeInTheDocument();
  });

  it("switches to Pro view with fact table", async () => {
    render(<CaseSummaryExperience studyRunId="l001-run" initialBundle={readyBundle()} />);
    await waitFor(() => {
      expect(screen.getByTestId("case-summary-view-pro")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("case-summary-view-pro"));
    await waitFor(() => {
      expect(screen.getByTestId("case-summary-pro-view")).toBeInTheDocument();
    });
    expect(screen.getByTestId("case-summary-pro-table")).toBeInTheDocument();
    expect(screen.getByTestId("case-summary-pro-preview-banner")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /review first/i })).toBeInTheDocument();
  });

  it("opens shared evidence panel from a Pro view chip", async () => {
    render(<CaseSummaryExperience studyRunId="l001-run" initialBundle={readyBundle()} />);
    fireEvent.click(await screen.findByTestId("case-summary-view-pro"));
    await waitFor(() => {
      expect(screen.getByTestId("case-summary-pro-view")).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByTestId("case-summary-evidence-chip")[0]!);
    await waitFor(() => {
      expect(screen.getByTestId("case-summary-evidence-panel")).toBeInTheDocument();
    });
  });

  it("shows meeting questions when user marks unsure", async () => {
    render(<CaseSummaryExperience studyRunId="l001-run" initialBundle={readyBundle()} />);
    await waitFor(() => {
      expect(screen.getByTestId("case-summary-decision-unsure")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("case-summary-decision-unsure"));
    await waitFor(() => {
      expect(screen.getByTestId("case-summary-meeting-questions")).toBeInTheDocument();
    });
  });
});
