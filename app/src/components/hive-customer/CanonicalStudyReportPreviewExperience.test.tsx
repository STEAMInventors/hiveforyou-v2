import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CanonicalStudyReportPreviewExperience } from "./CanonicalStudyReportPreviewExperience";

vi.mock("./HiveCustomerShell", () => ({
  HiveCustomerShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/hive-ui/HiveUiRenderer", () => ({
  HiveUiRenderer: () => <div data-testid="hive-ui-renderer">renderer</div>,
}));

vi.mock("./CanonicalStudyCustomerReportView", () => ({
  CanonicalStudyCustomerReportView: () => <div data-testid="legacy-customer-view" />,
}));

vi.mock("./CanonicalStudyProReportView", () => ({
  CanonicalStudyProReportView: () => <div data-testid="legacy-pro-view" />,
}));

const baseProjection = {
  schemaVersion: "canonical-study-report/1",
  audience: "customer",
  presentationMode: "internal_preview",
  customerProReportsPermitted: false,
  packApprovalLabel: "DEBUG_UNAPPROVED_PACK",
  packId: "synthetic",
  packVersion: "0.0.0",
  narrativeSource: "deterministic",
  sourceArtifactContentSha256: "e".repeat(64),
  studyRunId: "study-1",
  caseId: "case-1",
  body: {
    storySections: [],
    importantFacts: [],
    changes: [],
    supports: [],
    openQuestions: [],
  },
  hiveUiTree: {
    schemaVersion: "hive-ui-tree/1",
    caseId: "case-1",
    studyRunId: "study-1",
    audience: "customer",
    sourceReportArtifactHash: "e".repeat(64),
    catalogId: "hive-report-ui",
    catalogVersion: "1",
    narrativeSource: "deterministic",
    root: "root",
    elements: {
      root: { type: "ReportRoot", props: {}, children: [] },
    },
  },
};

describe("CanonicalStudyReportPreviewExperience", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/canonical-report")) {
        return new Response(JSON.stringify(baseProjection), { status: 200 });
      }
      if (url.includes("/hive-writer-shadow/ui-tree")) {
        return new Response(
          JSON.stringify({
            layout: "deterministic_fallback",
            hiveUiTree: null,
            fallbackReason: {
              code: "WRITER_RECORD_MISSING",
              message: "No Writer layout yet.",
              errorCodes: ["WRITER_RECORD_MISSING"],
            },
            shadowStatus: "missing",
            idempotencyKey: "k".repeat(64),
            validation: null,
          }),
          { status: 200 },
        );
      }
      if (url.includes("/hive-writer-shadow/run") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            status: "accepted",
            idempotencyKey: "k".repeat(64),
            validation: { ok: true, errorCodes: [], message: null },
            observability: { durationMs: 10, modelIdentifier: "mock", projectionHash: "e".repeat(64) },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ error: "UNEXPECTED" }), { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("loads deterministic layout on mount without Writer generation", async () => {
    render(
      <CanonicalStudyReportPreviewExperience
        caseId="case-1"
        studyRunId="study-1"
        initialAudience="customer"
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("hive-ui-renderer")).toBeInTheDocument();
    });
    const writerCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("hive-writer-shadow"),
    );
    expect(writerCalls).toHaveLength(0);
  });

  it("fetches Writer ui-tree only when Writer layout is selected", async () => {
    const user = userEvent.setup();
    render(
      <CanonicalStudyReportPreviewExperience
        caseId="case-1"
        studyRunId="study-1"
        initialAudience="customer"
      />,
    );
    await waitFor(() => expect(screen.getByTestId("hive-ui-renderer")).toBeInTheDocument());
    await user.click(screen.getByRole("tab", { name: "Writer" }));
    await waitFor(() => {
      expect(screen.getByTestId("writer-layout-status")).toBeInTheDocument();
    });
    const uiTreeGets = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/hive-writer-shadow/ui-tree"),
    );
    expect(uiTreeGets.length).toBeGreaterThanOrEqual(1);
    const runPosts = fetchMock.mock.calls.filter(
      ([url, init]) => String(url).includes("/hive-writer-shadow/run") && init?.method === "POST",
    );
    expect(runPosts).toHaveLength(0);
  });

  it("runs Writer generation only after explicit button click", async () => {
    const user = userEvent.setup();
    render(
      <CanonicalStudyReportPreviewExperience
        caseId="case-1"
        studyRunId="study-1"
        initialAudience="customer"
      />,
    );
    await waitFor(() => expect(screen.getByTestId("hive-ui-renderer")).toBeInTheDocument());
    await user.click(screen.getByTestId("generate-writer-layout"));
    await waitFor(() => {
      const runPosts = fetchMock.mock.calls.filter(
        ([url, init]) => String(url).includes("/hive-writer-shadow/run") && init?.method === "POST",
      );
      expect(runPosts).toHaveLength(1);
    });
  });

  it("shows deterministic fallback banner when Writer layout is unavailable", async () => {
    const user = userEvent.setup();
    render(
      <CanonicalStudyReportPreviewExperience
        caseId="case-1"
        studyRunId="study-1"
        initialAudience="customer"
      />,
    );
    await waitFor(() => expect(screen.getByTestId("hive-ui-renderer")).toBeInTheDocument());
    await user.click(screen.getByRole("tab", { name: "Writer" }));
    await waitFor(() => {
      expect(screen.getByTestId("writer-layout-fallback-banner")).toBeInTheDocument();
    });
  });
});
