import { act, render, screen, waitFor } from "@testing-library/react";
import React, { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HIVE_INTAKE_RUN_STORAGE_KEY } from "@/lib/intake/intake-client";
import { StagedDocumentsProvider, useStagedDocuments } from "@/lib/intake/staged-documents-context";
import type { IntakeEvidenceWorkspaceView } from "@hiveforyou/shared/intake";

import {
  IntakeUnderstanding,
  resetIntakeOrchestrationFlightForTests,
} from "./IntakeUnderstanding";

const CASE_ID = "00000000-0000-4000-8000-000000000001";
const HIVE_COMMIT = {
  caseId: CASE_ID,
  selectionIntent: "new" as const,
  hiveName: "Test Hive",
  hiveDescription: null,
};

const COMPOSER_PURPOSE = {
  rawIntent: "Preparing for an IEP meeting",
  explicitDomainId: "iep",
};

function mockMatchMedia() {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("reduce"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
  }),
}));

vi.mock("@/lib/documents/commit-client", () => ({
  commitStagedDocuments: vi.fn(),
}));

vi.mock("@/lib/intake/intake-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/intake/intake-client")>(
    "@/lib/intake/intake-client",
  );
  return {
    ...actual,
    fetchIntakeRun: vi.fn(),
    startIntakeRun: vi.fn(),
  };
});

import { commitStagedDocuments } from "@/lib/documents/commit-client";
import { fetchIntakeRun, startIntakeRun } from "@/lib/intake/intake-client";

function runningView(overrides: Partial<IntakeEvidenceWorkspaceView> = {}): IntakeEvidenceWorkspaceView {
  return {
    intakeRunId: "run-1",
    caseId: CASE_ID,
    status: "RUNNING",
    runStartedAt: new Date().toISOString(),
    processingDelayed: false,
    workspaceReady: false,
    sourceFiles: [],
    studyPath: "DOMAIN_PACK",
    purpose: {
      rawIntent: COMPOSER_PURPOSE.rawIntent,
      explicitDomainId: "iep",
      resolvedDomainId: "iep",
      resolutionSource: "EXPLICIT",
      displayPurpose: COMPOSER_PURPOSE.rawIntent,
      domainName: "Special Education / IEP",
    },
    understoodEvidence: [],
    thingsThatWouldHelp: [],
    documents: [
      {
        sourceDocumentId: "source-doc-1",
        processingStatus: "EXTRACTING",
        label: "Document",
        filename: "report.pdf",
        sizeBytes: 100,
      },
    ],
    ...overrides,
  };
}

function SeedStagedFiles({ files }: { files: File[] }) {
  const { addDocuments } = useStagedDocuments();
  useEffect(() => {
    addDocuments(files);
  }, [addDocuments, files]);
  return null;
}

function renderIntakeUnderstanding(options?: {
  resumeRunId?: string | null;
  files?: File[];
  strictMode?: boolean;
}) {
  const files = options?.files ?? [new File(["pdf"], "report.pdf", { type: "application/pdf" })];
  const tree = (
    <StagedDocumentsProvider>
      <SeedStagedFiles files={files} />
      <IntakeUnderstanding
        resumeRunId={options?.resumeRunId ?? null}
        composerPurpose={options?.resumeRunId ? null : COMPOSER_PURPOSE}
        hiveCommit={options?.resumeRunId ? null : HIVE_COMMIT}
      />
    </StagedDocumentsProvider>
  );
  return render(options?.strictMode ? <React.StrictMode>{tree}</React.StrictMode> : tree);
}

describe("IntakeUnderstanding orchestration", () => {
  beforeEach(() => {
    mockMatchMedia();
    resetIntakeOrchestrationFlightForTests();
    window.sessionStorage.clear();
    vi.mocked(commitStagedDocuments).mockReset();
    vi.mocked(startIntakeRun).mockReset();
    vi.mocked(fetchIntakeRun).mockReset();

    vi.mocked(commitStagedDocuments).mockImplementation(async (docs) => ({
      caseId: CASE_ID,
      documents: docs.map((document) => ({
        stagedDocumentId: document.id,
        sourceDocumentId: `persisted-${document.id}`,
      })),
    }));
    vi.mocked(startIntakeRun).mockImplementation(async () => {
      window.sessionStorage.setItem(HIVE_INTAKE_RUN_STORAGE_KEY, "run-1");
      return { intakeRunId: "run-1", status: "RUNNING" };
    });
    vi.mocked(fetchIntakeRun).mockImplementation(async () => runningView());
  });

  afterEach(() => {
    resetIntakeOrchestrationFlightForTests();
    window.sessionStorage.clear();
  });

  it("commits and starts intake once when adoptPersistedDocuments rewrites staged ids", async () => {
    renderIntakeUnderstanding();

    await waitFor(() => {
      expect(commitStagedDocuments).toHaveBeenCalledTimes(1);
      expect(startIntakeRun).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    expect(commitStagedDocuments).toHaveBeenCalledTimes(1);
    expect(startIntakeRun).toHaveBeenCalledTimes(1);
    expect(startIntakeRun).toHaveBeenCalledWith(
      CASE_ID,
      expect.arrayContaining([expect.stringMatching(/^persisted-/)]),
      {
        rawIntent: COMPOSER_PURPOSE.rawIntent,
        explicitDomainId: "iep",
      },
    );
  });

  it("polls the intake run via GET after commit and start", async () => {
    vi.mocked(fetchIntakeRun)
      .mockResolvedValueOnce(runningView())
      .mockResolvedValueOnce(
        runningView({
          status: "SUCCEEDED",
          workspaceReady: true,
          documents: [
            {
              sourceDocumentId: "source-doc-1",
              processingStatus: "CLASSIFIED",
              label: "Document",
              filename: "report.pdf",
              sizeBytes: 100,
            },
          ],
        }),
      );

    renderIntakeUnderstanding();

    await waitFor(() => {
      expect(fetchIntakeRun).toHaveBeenCalled();
    });

    await waitFor(
      () => {
        expect(vi.mocked(fetchIntakeRun).mock.calls.length).toBeGreaterThanOrEqual(2);
      },
      { timeout: 3000 },
    );

    expect(fetchIntakeRun).toHaveBeenCalledWith("run-1");
    expect(commitStagedDocuments).toHaveBeenCalledTimes(1);
  });

  it("resumes polling after Strict Mode effect cleanup without duplicate commit", async () => {
    renderIntakeUnderstanding({ strictMode: true });

    await waitFor(() => {
      expect(commitStagedDocuments).toHaveBeenCalledTimes(1);
      expect(startIntakeRun).toHaveBeenCalledTimes(1);
    });

    await waitFor(
      () => {
        expect(vi.mocked(fetchIntakeRun).mock.calls.length).toBeGreaterThanOrEqual(1);
      },
      { timeout: 3000 },
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    expect(commitStagedDocuments).toHaveBeenCalledTimes(1);
    expect(startIntakeRun).toHaveBeenCalledTimes(1);
  });

  it("resumes polling from session storage without recommitting files", async () => {
    window.sessionStorage.setItem(HIVE_INTAKE_RUN_STORAGE_KEY, "stored-run-9");
    vi.mocked(fetchIntakeRun).mockResolvedValue(
      runningView({ intakeRunId: "stored-run-9", status: "SUCCEEDED", workspaceReady: true }),
    );

    renderIntakeUnderstanding({ resumeRunId: null, files: [] });

    await waitFor(() => {
      expect(fetchIntakeRun).toHaveBeenCalledWith("stored-run-9");
    });

    expect(commitStagedDocuments).not.toHaveBeenCalled();
    expect(startIntakeRun).not.toHaveBeenCalled();
  });

  it("polls resumeRunId without commit when resuming an in-flight run", async () => {
    vi.mocked(fetchIntakeRun).mockResolvedValue(runningView({ intakeRunId: "resume-run-2" }));

    renderIntakeUnderstanding({ resumeRunId: "resume-run-2", files: [] });

    await waitFor(() => {
      expect(fetchIntakeRun).toHaveBeenCalledWith("resume-run-2");
    });

    expect(commitStagedDocuments).not.toHaveBeenCalled();
    expect(startIntakeRun).not.toHaveBeenCalled();
  });

  it("shows terminal intake failure instead of restarting processing", async () => {
    vi.mocked(fetchIntakeRun).mockResolvedValue(
      runningView({ status: "FAILED", workspaceReady: false }),
    );

    renderIntakeUnderstanding();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/couldn't finish reading/i);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    expect(commitStagedDocuments).toHaveBeenCalledTimes(1);
    expect(startIntakeRun).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetchIntakeRun).mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});
