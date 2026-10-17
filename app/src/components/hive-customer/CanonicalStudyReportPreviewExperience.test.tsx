import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CanonicalStudyReportPreviewExperience } from "./CanonicalStudyReportPreviewExperience";

vi.mock("./HiveCustomerShell", () => ({
  HiveCustomerShell: ({
    children,
    workspace,
  }: {
    children: React.ReactNode;
    workspace?: { activeSection: string };
  }) => (
    <div>
      {workspace ? (
        <nav data-testid="case-workspace-breadcrumbs">
          <span aria-current="page">{workspace.activeSection === "reports" ? "Reports" : ""}</span>
        </nav>
      ) : null}
      {children}
    </div>
  ),
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

const WRITER_RUN_ID = "11111111-1111-4111-8111-111111111111";

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
            writerRunId: WRITER_RUN_ID,
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

  it("loads inverted report on mount with read-only Writer preview, without generation POST", async () => {
    render(
      <CanonicalStudyReportPreviewExperience
        caseId="case-1"
        studyRunId="study-1"
        initialAudience="customer"
      />,
    );
    expect(screen.getByTestId("case-workspace-breadcrumbs")).toBeInTheDocument();
    expect(screen.getByText("Reports")).toHaveAttribute("aria-current", "page");
    await waitFor(() => {
      expect(screen.getByTestId("hive-ui-renderer")).toBeInTheDocument();
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

  it("switches to code-built layout without triggering Writer generation", async () => {
    const user = userEvent.setup();
    render(
      <CanonicalStudyReportPreviewExperience
        caseId="case-1"
        studyRunId="study-1"
        initialAudience="customer"
      />,
    );
    await waitFor(() => expect(screen.getByTestId("hive-ui-renderer")).toBeInTheDocument());
    await user.click(screen.getByRole("tab", { name: "Code-built layout" }));
    await waitFor(() => {
      expect(screen.getByTestId("hive-ui-renderer")).toBeInTheDocument();
    });
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

  it("polls status after a queued Writer request and renders the accepted tree", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/canonical-report")) {
        return new Response(JSON.stringify(baseProjection), { status: 200 });
      }
      if (url.includes("/hive-writer-shadow/status")) {
        return new Response(
          JSON.stringify({
            writerRunId: WRITER_RUN_ID,
            status: "accepted",
            idempotencyKey: "k".repeat(64),
            validation: { ok: true, errorCodes: [], message: null },
            observability: { durationMs: 12, modelIdentifier: "mock", projectionHash: "e".repeat(64) },
          }),
          { status: 200 },
        );
      }
      if (url.includes("/hive-writer-shadow/ui-tree")) {
        return new Response(
          JSON.stringify({
            layout: "writer",
            hiveUiTree: baseProjection.hiveUiTree,
            fallbackReason: null,
            shadowStatus: "accepted",
            idempotencyKey: "k".repeat(64),
            validation: { ok: true, errorCodes: [], message: null },
            writerShadowEnabled: true,
          }),
          { status: 200 },
        );
      }
      if (url.includes("/hive-writer-shadow/run") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            writerRunId: WRITER_RUN_ID,
            status: "queued",
            idempotencyKey: "k".repeat(64),
            validation: { ok: false, errorCodes: ["QUEUED"], message: null },
            observability: { durationMs: 0, modelIdentifier: null, projectionHash: "e".repeat(64) },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ error: "UNEXPECTED" }), { status: 500 });
    });
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
      expect(screen.getByTestId("writer-layout-status")).toHaveTextContent("accepted");
    });
    const statusGets = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/hive-writer-shadow/status"),
    );
    const uiTreeGets = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/hive-writer-shadow/ui-tree"),
    );
    expect(statusGets.length).toBeGreaterThanOrEqual(1);
    expect(uiTreeGets.length).toBeGreaterThanOrEqual(1);
  });

  it("shows the deterministic fallback when Writer generation is rejected", async () => {
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
              code: "WRITER_RECORD_NOT_ACCEPTED",
              message: "Writer layout was rejected.",
              errorCodes: ["HIVE_UI_TREE_INVALID"],
            },
            shadowStatus: "rejected",
            idempotencyKey: "k".repeat(64),
            validation: { ok: false, errorCodes: ["HIVE_UI_TREE_INVALID"], message: "invalid" },
            writerShadowEnabled: true,
          }),
          { status: 200 },
        );
      }
      if (url.includes("/hive-writer-shadow/run") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            writerRunId: WRITER_RUN_ID,
            status: "rejected",
            idempotencyKey: "k".repeat(64),
            validation: { ok: false, errorCodes: ["HIVE_UI_TREE_INVALID"], message: "invalid" },
            observability: { durationMs: 4, modelIdentifier: "mock", projectionHash: "e".repeat(64) },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ error: "UNEXPECTED" }), { status: 500 });
    });
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
      expect(screen.getByTestId("writer-layout-fallback-banner")).toHaveTextContent(
        "Writer layout was rejected.",
      );
    });
    expect(screen.getByTestId("hive-ui-renderer")).toBeInTheDocument();
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
    await user.click(screen.getByRole("tab", { name: "Report layout" }));
    await waitFor(() => {
      expect(screen.getByTestId("writer-layout-fallback-banner")).toBeInTheDocument();
    });
  });
});
