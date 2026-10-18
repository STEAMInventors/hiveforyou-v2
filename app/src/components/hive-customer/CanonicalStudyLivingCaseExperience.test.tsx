import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CanonicalStudyLivingCaseExperience } from "./CanonicalStudyLivingCaseExperience";

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
    catalogId: "hive-canonical-report",
    catalogVersion: "1",
    narrativeSource: "deterministic",
    root: "root",
    elements: {
      root: { type: "ReportRoot", props: {}, children: [] },
    },
  },
};

describe("CanonicalStudyLivingCaseExperience", () => {
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

  it("loads Living Case renderer on mount without generation POST", async () => {
    render(
      <CanonicalStudyLivingCaseExperience
        caseId="case-1"
        studyRunId="study-1"
        initialAudience="customer"
      />,
    );
    expect(screen.getByTestId("case-workspace-breadcrumbs")).toBeInTheDocument();
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
      <CanonicalStudyLivingCaseExperience
        caseId="case-1"
        studyRunId="study-1"
        initialAudience="customer"
      />,
    );
    await waitFor(() => expect(screen.getByTestId("hive-ui-renderer")).toBeInTheDocument());
    await user.click(screen.getByTestId("generate-canonical-report"));
    await waitFor(() => {
      const runPosts = fetchMock.mock.calls.filter(
        ([url, init]) => String(url).includes("/hive-writer-shadow/run") && init?.method === "POST",
      );
      expect(runPosts).toHaveLength(1);
    });
  });

  it("shows empty state when no UI tree is available", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/canonical-report")) {
        return new Response(JSON.stringify({ ...baseProjection, hiveUiTree: null }), { status: 200 });
      }
      if (url.includes("/hive-writer-shadow/ui-tree")) {
        return new Response(
          JSON.stringify({
            layout: "deterministic_fallback",
            hiveUiTree: null,
            fallbackReason: null,
            shadowStatus: "missing",
            idempotencyKey: "k".repeat(64),
            validation: null,
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ error: "UNEXPECTED" }), { status: 500 });
    });
    render(
      <CanonicalStudyLivingCaseExperience
        caseId="case-1"
        studyRunId="study-1"
        initialAudience="customer"
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("living-case-empty")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("legacy-customer-view")).not.toBeInTheDocument();
  });
});
