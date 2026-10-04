import { fireEvent, render, screen, waitFor } from "@testing-library/react";



import { beforeEach, describe, expect, it, vi } from "vitest";



import type { IntakeEvidenceWorkspaceView } from "@hiveforyou/shared/intake";



import { IntakeEvidenceWorkspace } from "./IntakeEvidenceWorkspace";



const mockPush = vi.fn();

const mockClearDocuments = vi.fn();



vi.mock("next/navigation", () => ({

  useRouter: () => ({ push: mockPush }),

}));



vi.mock("@/lib/intake/staged-documents-context", () => ({

  useStagedDocuments: () => ({

    documents: [],

    addDocuments: vi.fn(),

    removeDocument: vi.fn(),

    clearDocuments: mockClearDocuments,

    adoptPersistedDocuments: vi.fn(),

  }),

}));



vi.mock("@/lib/intake/intake-client", () => ({

  fetchIntakeRun: vi.fn(),

  setIntakeSourceDisposition: vi.fn(),

  appendIntakeSources: vi.fn(),

  resetIntakeHomeSession: vi.fn(),

  startIntakeStudy: vi.fn(),

}));



vi.mock("@/lib/documents/commit-client", () => ({

  commitStagedDocuments: vi.fn(),

}));



import {

  fetchIntakeRun,

  resetIntakeHomeSession,

  setIntakeSourceDisposition,

  startIntakeStudy,

} from "@/lib/intake/intake-client";



const workspaceView: IntakeEvidenceWorkspaceView = {

  intakeRunId: "run-1",

  caseId: "case-1",

  status: "SUCCEEDED",

  runStartedAt: null,

  processingDelayed: false,

  workspaceReady: true,

  studyPath: "DOMAIN_PACK",

  purpose: {

    rawIntent: "IEP Prep",

    explicitDomainId: "iep",

    resolvedDomainId: "iep",

    resolutionSource: "EXPLICIT",

    displayPurpose: "IEP Prep",

    domainName: "Special Education / IEP",

  },

  sourceFiles: [

    {

      sourceDocumentId: "src-1",

      filename: "01_prior_iep.pdf",

      fileTypeLabel: "PDF",

      sizeBytes: 112_000,

      disposition: "PRESENT",

      documentTypeSummary: "IEP",

      processingStatus: "CLASSIFIED",

      logicalDocuments: [

        {

          logicalDocumentId: "src-1:1-3",

          customerLabel: "IEP",

          pageStart: 1,

          pageEnd: 3,

          processingDisposition: "PROCESS",

        },

      ],

    },

    {

      sourceDocumentId: "src-packet",

      filename: "school_packet.pdf",

      fileTypeLabel: "PDF",

      sizeBytes: 2_400_000,

      disposition: "PRESENT",

      documentTypeSummary: "2 documents",

      processingStatus: "CLASSIFIED",

      logicalDocuments: [

        {

          logicalDocumentId: "src-packet:1-2",

          customerLabel: "Evaluation Plan",

          pageStart: 1,

          pageEnd: 2,

          processingDisposition: "PROCESS",

        },

        {

          logicalDocumentId: "src-packet:3-7",

          customerLabel: "Psychoeducational Evaluation",

          pageStart: 3,

          pageEnd: 7,

          processingDisposition: "PROCESS",

        },

      ],

    },

  ],

  understoodEvidence: [],

  thingsThatWouldHelp: [],

  documents: [],

};



describe("IntakeEvidenceWorkspace", () => {

  beforeEach(() => {

    mockPush.mockReset();

    mockClearDocuments.mockReset();

    vi.mocked(fetchIntakeRun).mockReset();

    vi.mocked(setIntakeSourceDisposition).mockReset();

    vi.mocked(resetIntakeHomeSession).mockReset();

    vi.mocked(startIntakeStudy).mockReset();

    vi.mocked(fetchIntakeRun).mockResolvedValue(workspaceView);

  });



  it("starts canonical study from Build my hive when workspace is ready", async () => {

    vi.mocked(startIntakeStudy).mockResolvedValue({

      run: {

        studyRunId: "study-1",

        caseId: "case-1",

        intakeRunId: "run-1",

        idempotencyKey: "key",

        studyContextId: "ctx-1",

        domainId: "iep",

        domainPackId: "pack",

        domainPackVersion: "1",

        questionSetVersion: "intake-study-empty/1",

        answerSnapshotHash: "hash",

        providerId: "fixture",

        providerMode: "fixture",

        startedAt: new Date().toISOString(),

        status: "SUCCEEDED",

      },

      stage: "complete",

      reusedExistingRun: false,

    });



    render(<IntakeEvidenceWorkspace intakeRunId="run-1" />);

    await waitFor(() => {

      expect(screen.getByTestId("intake-build-my-study")).toBeInTheDocument();

    });

    fireEvent.click(screen.getByTestId("intake-build-my-study"));

    await waitFor(() => {

      expect(startIntakeStudy).toHaveBeenCalledWith("run-1");

    });

    await waitFor(() => {

      expect(mockPush).toHaveBeenCalledWith("/study/study-1/map");

    });

  });



  it("Change clears client session and staged files before returning home", async () => {

    render(<IntakeEvidenceWorkspace intakeRunId="run-1" />);

    await waitFor(() => {

      expect(screen.getByTestId("intake-purpose-change")).toBeInTheDocument();

    });

    fireEvent.click(screen.getByTestId("intake-purpose-change"));

    expect(resetIntakeHomeSession).toHaveBeenCalledOnce();

    expect(mockClearDocuments).toHaveBeenCalledOnce();

    expect(mockPush).toHaveBeenCalledWith("/");

  });



  it("renders artifact layout with domain pill and file rows", async () => {

    render(<IntakeEvidenceWorkspace intakeRunId="run-1" />);



    await waitFor(() => {

      expect(screen.getByText("Your documents")).toBeInTheDocument();

    });



    expect(screen.getByText("Special Education / IEP")).toBeInTheDocument();

    expect(screen.getByText("01_prior_iep.pdf")).toBeInTheDocument();

    expect(screen.getByText("school_packet.pdf")).toBeInTheDocument();

    expect(screen.getByText("2 documents")).toBeInTheDocument();

    expect(screen.getByTestId("intake-add-files")).toHaveTextContent("Add files");

    expect(screen.getByTestId("intake-file-summary")).toHaveTextContent("2 of 2 files included");

    expect(screen.queryByText(/Jev/i)).not.toBeInTheDocument();

  });



  it("calls setIntakeSourceDisposition when Remove is clicked", async () => {

    vi.mocked(setIntakeSourceDisposition).mockResolvedValue({

      ...workspaceView,

      sourceFiles: workspaceView.sourceFiles.map((file, index) =>

        index === 0 ? { ...file, disposition: "DISCARDED" as const } : file,

      ),

    });



    render(<IntakeEvidenceWorkspace intakeRunId="run-1" />);



    await waitFor(() => {

      expect(screen.getAllByTestId("intake-remove-from-analysis")).toHaveLength(2);

    });



    fireEvent.click(screen.getAllByTestId("intake-remove-from-analysis")[0]!);



    await waitFor(() => {

      expect(setIntakeSourceDisposition).toHaveBeenCalledWith("run-1", "src-1", "DISCARDED");

    });

  });



  it("shows missing evidence upload actions when completeness has open items", async () => {

    vi.mocked(fetchIntakeRun).mockResolvedValue({

      ...workspaceView,

      thingsThatWouldHelp: [

        {

          packExpectationId: "exp-1",

          customerLabel: "Current IEP",

          requirementClass: "REQUIRED",

          state: "OPEN",

        },

      ],

    });



    render(<IntakeEvidenceWorkspace intakeRunId="run-1" />);



    await waitFor(() => {

      expect(screen.getByTestId("intake-things-that-would-help")).toBeInTheDocument();

    });



    expect(screen.getByTestId("intake-missing-upload")).toHaveTextContent("Upload");

  });

});

