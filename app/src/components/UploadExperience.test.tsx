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

import { commitStagedDocuments } from "@/lib/documents/commit-client";
import { runDiscoverForStagedDocuments } from "@/lib/document-discovery/run-discover-client";
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

describe("UploadExperience", () => {
  beforeEach(() => {
    mockMatchMedia(false);
    window.sessionStorage.clear();
    mockReplace.mockReset();
    vi.mocked(runDiscoverForStagedDocuments).mockReset();
    vi.mocked(startIntakeRun).mockClear();
    vi.mocked(commitStagedDocuments).mockClear();
    vi.mocked(fetchIntakeRun).mockReset();
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

  it("starts intake with composer purpose after Continue", async () => {
    const { container } = renderUploadExperience();
    submitComposerFlow(container);

    expect(screen.getByTestId("hive-home-composer")).toBeInTheDocument();
    expect(screen.getByTestId("intake-processing-modal")).toBeInTheDocument();
    expect(screen.getByTestId("intake-processing-panel")).toBeInTheDocument();
    expect(screen.getByTestId("intake-heading")).toHaveTextContent("Hiving");
    expect(screen.getByTestId("intake-processing-stage-current")).toHaveTextContent(
      "Reading your documents",
    );

    await waitFor(() => {
      expect(commitStagedDocuments).toHaveBeenCalledOnce();
    });

    expect(startIntakeRun).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
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
    submitComposerFlow(container);

    await waitFor(() => {
      expect(screen.getByTestId("intake-heading")).toHaveTextContent("Your hive is ready");
    });
    fireEvent.click(screen.getByTestId("intake-open-hive"));
    expect(mockReplace).toHaveBeenCalledWith("/intake/run-1");
    expect(window.sessionStorage.getItem(HIVE_INTAKE_RUN_STORAGE_KEY)).toBeNull();
    expect(runDiscoverForStagedDocuments).not.toHaveBeenCalled();
  });
});
