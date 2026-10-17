import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HIVE_INTAKE_RUN_STORAGE_KEY } from "@/lib/intake/intake-client";
import { StagedDocumentsProvider } from "@/lib/intake/staged-documents-context";
import type { IntakeEvidenceWorkspaceView } from "@hiveforyou/shared/intake";

import { UploadExperience } from "./UploadExperience";

const mockReplace = vi.fn();

function mockMatchMedia(reducedMotion = false) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("reduce") ? reducedMotion : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: vi.fn(),
  }),
}));

vi.mock("@hiveforyou/domain-packs", () => ({
  listDomainPacksByCapability: () => [{ id: "iep", name: "Special Education / IEP" }],
}));

vi.mock("@/lib/auth/client-session", () => ({
  resolveWorkflowSessionStatus: vi.fn(),
  WORKFLOW_SESSION_UNAVAILABLE_MESSAGE:
    "No authorized session is available. In local development, enable HIVE_DEV_AUTO_AUTH with HIVE_DEV_AUTH_EMAIL and HIVE_DEV_AUTH_PASSWORD, or sign in with a real Supabase session.",
}));

vi.mock("@/lib/cases/cases-client", () => ({
  fetchOwnedHives: vi.fn(async () => ({ cases: [] })),
  fetchOwnedHive: vi.fn(),
  OwnedHivesFetchError: class OwnedHivesFetchError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

vi.mock("@/lib/documents/commit-client", () => ({
  commitStagedDocuments: vi.fn(async (docs: { id: string; file: File }[]) => ({
    caseId: "00000000-0000-4000-8000-000000000001",
    documents: docs.map((doc) => ({
      stagedDocumentId: doc.id,
      sourceDocumentId: `src-${doc.file.name}`,
    })),
  })),
}));

vi.mock("@/lib/document-discovery/run-discover-client", () => ({
  runDiscoverForStagedDocuments: vi.fn(),
  continueDiscoverForStagedDocuments: vi.fn(),
}));

vi.mock("@/lib/intake/intake-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/intake/intake-client")>(
    "@/lib/intake/intake-client",
  );
  return {
    ...actual,
    startIntakeRun: vi.fn(async () => {
      window.sessionStorage.setItem("hive-intake-run-id", "run-1");
      return { intakeRunId: "run-1", status: "RUNNING" as const };
    }),
    fetchIntakeRun: vi.fn(),
  };
});

import { resolveWorkflowSessionStatus } from "@/lib/auth/client-session";
import { commitStagedDocuments } from "@/lib/documents/commit-client";
import { runDiscoverForStagedDocuments } from "@/lib/document-discovery/run-discover-client";
import { fetchOwnedHive, fetchOwnedHives } from "@/lib/cases/cases-client";
import { fetchIntakeRun, startIntakeRun } from "@/lib/intake/intake-client";

function renderUploadExperience() {
  return render(
    <StagedDocumentsProvider>
      <UploadExperience />
    </StagedDocumentsProvider>,
  );
}

function terminalView(
  overrides: Partial<IntakeEvidenceWorkspaceView> = {},
): IntakeEvidenceWorkspaceView {
  return {
    intakeRunId: "run-1",
    caseId: "00000000-0000-4000-8000-000000000001",
    status: "SUCCEEDED",
    runStartedAt: null,
    processingDelayed: false,
    workspaceReady: true,
    sourceFiles: [],
    studyPath: "DOMAIN_PACK",
    purpose: {
      rawIntent: "Preparing for an IEP meeting",
      explicitDomainId: "iep",
      resolvedDomainId: "iep",
      resolutionSource: "EXPLICIT",
      displayPurpose: "Preparing for an IEP meeting",
      domainName: "Special Education / IEP",
    },
    understoodEvidence: [],
    thingsThatWouldHelp: [],
    documents: [
      {
        sourceDocumentId: "src-report.pdf",
        processingStatus: "CLASSIFIED",
        label: "Special education document",
        filename: "report.pdf",
        sizeBytes: 1024,
      },
    ],
    ...overrides,
  };
}

function submitComposerFlow(container: HTMLElement) {
  fireEvent.change(screen.getByTestId("hive-composer-intent"), {
    target: { value: "Preparing for an IEP meeting" },
  });
  fireEvent.click(screen.getByTestId("hive-composer-domain-iep"));
  const file = new File(["x".repeat(1024)], "report.pdf", { type: "application/pdf" });
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
  fireEvent.click(screen.getByTestId("hive-composer-submit"));
}

async function completeCreateHiveModal(hiveName = "Maya's IEP 2025-26") {
  await waitFor(() => {
    expect(screen.getByTestId("landing-hive-handoff-create")).toBeInTheDocument();
  });
  fireEvent.click(screen.getByTestId("landing-hive-handoff-create"));
  await waitFor(() => {
    expect(screen.getByTestId("landing-create-hive-modal")).toBeInTheDocument();
  });
  fireEvent.change(screen.getByTestId("landing-create-hive-name"), {
    target: { value: hiveName },
  });
  fireEvent.click(screen.getByTestId("landing-create-hive-submit"));
}

async function submitComposerThroughAuthenticatedHandoff(container: HTMLElement) {
  submitComposerFlow(container);
  await waitFor(() => {
    expect(screen.getByTestId("landing-hive-handoff")).toBeInTheDocument();
  });
  await completeCreateHiveModal();
  await waitFor(() => {
    expect(screen.getByTestId("intake-processing-modal")).toBeInTheDocument();
  });
}

describe("UploadExperience", () => {
  beforeEach(() => {
    mockMatchMedia(false);
    window.sessionStorage.clear();
    mockReplace.mockReset();
    vi.mocked(runDiscoverForStagedDocuments).mockReset();
    vi.mocked(startIntakeRun).mockClear();
    vi.mocked(commitStagedDocuments).mockClear();
    vi.mocked(fetchIntakeRun).mockReset();
    vi.mocked(resolveWorkflowSessionStatus).mockReset();
    vi.mocked(resolveWorkflowSessionStatus).mockResolvedValue("authenticated");
    vi.mocked(fetchOwnedHives).mockClear();
    vi.mocked(fetchOwnedHive).mockClear();
    vi.mocked(fetchIntakeRun).mockResolvedValue({
      intakeRunId: "run-1",
      caseId: "00000000-0000-4000-8000-000000000001",
      status: "RUNNING",
      runStartedAt: "2026-10-04T12:00:00.000Z",
      processingDelayed: false,
      workspaceReady: false,
      sourceFiles: [],
      studyPath: "GENERIC_STUDY",
      purpose: {
        rawIntent: "Preparing for an IEP meeting",
        explicitDomainId: "iep",
        resolvedDomainId: null,
        resolutionSource: null,
        displayPurpose: "Preparing for an IEP meeting",
        domainName: null,
      },
      understoodEvidence: [],
      thingsThatWouldHelp: [],
      documents: [
        {
          sourceDocumentId: "src-report.pdf",
          processingStatus: "EXTRACTING",
          label: null,
          filename: "report.pdf",
          sizeBytes: 1024,
        },
      ],
    });
  });

  it("shows the home composer before intake starts", () => {
    renderUploadExperience();
    expect(screen.getByTestId("hive-home-composer")).toBeInTheDocument();
    expect(screen.getByTestId("hive-composer-intent")).toBeInTheDocument();
  });

  it("shows the login placeholder and skips protected APIs when signed out", async () => {
    vi.mocked(resolveWorkflowSessionStatus).mockResolvedValue("unauthenticated");
    const { container } = renderUploadExperience();
    submitComposerFlow(container);

    await waitFor(() => {
      expect(screen.getByTestId("landing-auth-placeholder")).toBeInTheDocument();
    });
    expect(screen.getByTestId("landing-auth-not-connected-notice")).toHaveTextContent(
      /placeholders/i,
    );
    expect(commitStagedDocuments).not.toHaveBeenCalled();
    expect(startIntakeRun).not.toHaveBeenCalled();
  });

  it("returns to the composer with preserved intent and files after Back from auth", async () => {
    vi.mocked(resolveWorkflowSessionStatus).mockResolvedValue("unauthenticated");
    const { container } = renderUploadExperience();
    submitComposerFlow(container);

    await waitFor(() => {
      expect(screen.getByTestId("landing-auth-placeholder")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("landing-auth-back"));

    expect(screen.getByTestId("hive-composer-intent")).toHaveValue("Preparing for an IEP meeting");
    expect(screen.getAllByTestId("hive-composer-attachment-chip")).toHaveLength(1);
    expect(commitStagedDocuments).not.toHaveBeenCalled();
  });

  it("advances to the hive handoff when a real session appears from the auth placeholder", async () => {
    vi.mocked(resolveWorkflowSessionStatus)
      .mockResolvedValueOnce("unauthenticated")
      .mockResolvedValueOnce("authenticated");
    const { container } = renderUploadExperience();
    submitComposerFlow(container);

    await waitFor(() => {
      expect(screen.getByTestId("landing-auth-placeholder")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("landing-auth-session-continue"));

    await waitFor(() => {
      expect(screen.getByTestId("landing-hive-handoff")).toBeInTheDocument();
    });
    expect(commitStagedDocuments).not.toHaveBeenCalled();
  });

  it("shows loading feedback while rechecking session from the auth placeholder", async () => {
    vi.mocked(resolveWorkflowSessionStatus)
      .mockResolvedValueOnce("unauthenticated")
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve("unauthenticated"), 50);
          }),
      );
    const { container } = renderUploadExperience();
    submitComposerFlow(container);

    await waitFor(() => {
      expect(screen.getByTestId("landing-auth-placeholder")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("landing-auth-session-continue"));

    expect(screen.getByTestId("landing-auth-session-continue")).toHaveTextContent(
      /checking sign-in/i,
    );
    expect(screen.getByTestId("landing-auth-session-continue")).toBeDisabled();

    await waitFor(() => {
      expect(screen.getByTestId("landing-auth-session-continue-notice")).toHaveTextContent(
        /HIVE_DEV_AUTO_AUTH/i,
      );
    });
    expect(screen.getByTestId("landing-auth-placeholder")).toBeInTheDocument();
    expect(fetchOwnedHives).not.toHaveBeenCalled();
    expect(commitStagedDocuments).not.toHaveBeenCalled();
  });

  it("blocks onboarding when Continue is clicked without an authorized session", async () => {
    vi.mocked(resolveWorkflowSessionStatus).mockResolvedValue("unauthenticated");
    const { container } = renderUploadExperience();
    submitComposerFlow(container);

    await waitFor(() => {
      expect(screen.getByTestId("landing-auth-placeholder")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("landing-auth-session-continue"));

    await waitFor(() => {
      expect(screen.getByTestId("landing-auth-session-continue-notice")).toHaveTextContent(
        /HIVE_DEV_AUTO_AUTH/i,
      );
    });
    expect(screen.queryByTestId("landing-hive-handoff")).not.toBeInTheDocument();
    expect(fetchOwnedHives).not.toHaveBeenCalled();
    expect(commitStagedDocuments).not.toHaveBeenCalled();
    expect(startIntakeRun).not.toHaveBeenCalled();
  });

  it("starts real intake after auth placeholder when session resolves on Continue", async () => {
    vi.mocked(resolveWorkflowSessionStatus)
      .mockResolvedValueOnce("unauthenticated")
      .mockResolvedValueOnce("authenticated");
    const { container } = renderUploadExperience();
    submitComposerFlow(container);

    await waitFor(() => {
      expect(screen.getByTestId("landing-auth-placeholder")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("landing-auth-session-continue"));

    await waitFor(() => {
      expect(screen.getByTestId("landing-hive-handoff")).toBeInTheDocument();
    });
    await completeCreateHiveModal("Dev Hive");

    await waitFor(() => {
      expect(screen.getByTestId("intake-processing-modal")).toBeInTheDocument();
    });
    expect(commitStagedDocuments).toHaveBeenCalledOnce();
    expect(startIntakeRun).toHaveBeenCalledOnce();
  });

  it("shows an inline notice when session recheck fails", async () => {
    vi.mocked(resolveWorkflowSessionStatus)
      .mockResolvedValueOnce("unauthenticated")
      .mockResolvedValueOnce("error");
    const { container } = renderUploadExperience();
    submitComposerFlow(container);

    await waitFor(() => {
      expect(screen.getByTestId("landing-auth-placeholder")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("landing-auth-session-continue"));

    await waitFor(() => {
      expect(screen.getByTestId("landing-auth-session-continue-notice")).toHaveTextContent(
        /couldn't check sign-in/i,
      );
    });
    expect(screen.getByTestId("landing-auth-placeholder")).toBeInTheDocument();
  });

  it("starts intake with composer purpose after authenticated handoff Continue", async () => {
    const { container } = renderUploadExperience();
    await submitComposerThroughAuthenticatedHandoff(container);

    expect(screen.getByTestId("intake-processing-panel")).toBeInTheDocument();
    expect(screen.getByTestId("intake-heading")).toHaveTextContent("Reading your documents");

    await waitFor(() => {
      expect(commitStagedDocuments).toHaveBeenCalledOnce();
    expect(commitStagedDocuments).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        selectionIntent: "new",
        caseId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        ),
      }),
    );
    });

    expect(startIntakeRun).toHaveBeenCalledWith(
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      ),
      ["src-report.pdf"],
      {
        rawIntent: "Preparing for an IEP meeting",
        explicitDomainId: "iep",
      },
    );
    expect(runDiscoverForStagedDocuments).not.toHaveBeenCalled();
  });

  it("navigates to the evidence workspace when intake finishes with persisted artifacts", async () => {
    vi.mocked(fetchIntakeRun).mockResolvedValue(terminalView());
    const { container } = renderUploadExperience();
    await submitComposerThroughAuthenticatedHandoff(container);

    await waitFor(
      () => {
        expect(screen.getByTestId("intake-heading")).toHaveTextContent("Your documents are read");
      },
      { timeout: 5000 },
    );
    fireEvent.click(screen.getByTestId("intake-open-hive"));
    expect(mockReplace).toHaveBeenCalledWith("/intake/run-1");
    expect(window.sessionStorage.getItem(HIVE_INTAKE_RUN_STORAGE_KEY)).toBeNull();
    expect(runDiscoverForStagedDocuments).not.toHaveBeenCalled();
  });
});
