import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { act, fireEvent, render, screen, within } from "@testing-library/react";

import { DocumentDiscoveryExperience } from "./DocumentDiscoveryExperience";

import { StagedDocumentsProvider } from "@/lib/intake/staged-documents-context";
import {
  continueDiscoverForStagedDocuments,
  runDiscoverForStagedDocuments,
} from "@/lib/document-discovery/run-discover-client";
import { createStagedDocuments } from "@/lib/staged-documents";

import { PROCESSING_STAGE_LABELS } from "@/lib/document-discovery/processing-stages";
import type { HiveDiscoverResult } from "@hiveforyou/shared/discover";

vi.mock("@/lib/document-discovery/run-discover-client", () => ({
  runDiscoverForStagedDocuments: vi.fn(),
  continueDiscoverForStagedDocuments: vi.fn(),
}));



const ENGINE2_FORBIDDEN_SNIPPETS = [

  "WISC",

  "BASC",

  "CELF",

  "diagnosis",

  "eligibility",

  "service minutes",

  "Key Extracted",

  "IQ",

  "therapy recommendation",

];



function mockMatchMedia(reducedMotion: boolean) {

  window.matchMedia = vi.fn().mockImplementation((query: string) => ({

    matches: query.includes("reduce") ? reducedMotion : false,

    media: query,

    addEventListener: vi.fn(),

    removeEventListener: vi.fn(),

  }));

}



function renderDiscovery(filenames: string[]) {

  const files = filenames.map(

    (name) => new File(["content"], name, { type: "application/pdf" }),

  );

  const staged = createStagedDocuments(files);

  return render(

    <StagedDocumentsProvider>

      <DocumentDiscoveryExperience stagedDocuments={staged} />

    </StagedDocumentsProvider>,

  );

}



async function advanceProcessingToSettled() {

  for (let step = 0; step < 12; step += 1) {

    await act(async () => {

      vi.advanceTimersByTime(2000);

    });

    if (screen.queryByText("Your documents are organized.")) {

      return;

    }

  }

}



describe("DocumentDiscoveryExperience", () => {

  beforeEach(() => {

    vi.useFakeTimers();

    mockMatchMedia(false);

    vi.mocked(runDiscoverForStagedDocuments).mockRejectedValue(new Error("DISCOVER_UNAVAILABLE"));

    vi.mocked(continueDiscoverForStagedDocuments).mockRejectedValue(new Error("DISCOVER_UNAVAILABLE"));

  });



  afterEach(() => {

    vi.useRealTimers();

  });



  it("renders human processing stages before settling", () => {

    renderDiscovery(["iep_2024.pdf", "eval_report.pdf"]);



    expect(screen.getByTestId("discovery-workflow-modal")).toBeInTheDocument();

    expect(screen.getByTestId("processing-stage-indicator")).toHaveTextContent(

      PROCESSING_STAGE_LABELS[0],

    );

    expect(screen.getByTestId("discovery-processing-panel")).toBeInTheDocument();

    expect(screen.getByTestId("hive-hex-animation")).toBeInTheDocument();

  });



  it("renders settled compact inventory and headline", async () => {

    renderDiscovery(["iep_2024.pdf", "eval_report.pdf"]);



    await advanceProcessingToSettled();



    expect(screen.getByText("Your documents are organized.")).toBeInTheDocument();

    expect(screen.getByTestId("discovery-compact-inventory")).toBeInTheDocument();

    expect(screen.getByTestId("answer-questions-cta")).toHaveAttribute(

      "href",

      "/questions",

    );

  });



  it("shows document-level metadata on recognized inventory rows", async () => {

    renderDiscovery(["iep_2024.pdf"]);

    await advanceProcessingToSettled();



    const node = screen.getByTestId(/^document-node-/);

    expect(within(node).getByText(/Individualized Education Program/i)).toBeInTheDocument();

    expect(within(node).getByText(/Recognized/i)).toBeInTheDocument();

  });



  it("renders missing expected document with restrained treatment", async () => {

    renderDiscovery(["iep_2024.pdf"]);

    await advanceProcessingToSettled();



    const missing = screen.getByTestId("missing-document-node-missing-pwn");

    expect(within(missing).getByText("Prior Written Notice")).toBeInTheDocument();

    expect(within(missing).getByText(/not provided/i)).toBeInTheDocument();

  });



  it("opens document-level inspector without case intelligence fields", async () => {

    renderDiscovery(["iep_2024.pdf"]);

    await advanceProcessingToSettled();



    fireEvent.click(screen.getByTestId(/^document-node-/));



    const inspector = screen.getByTestId("document-inspector");

    expect(within(inspector).getByText("Original filename")).toBeInTheDocument();

    expect(within(inspector).getByText("iep_2024.pdf")).toBeInTheDocument();



    const inspectorText = inspector.textContent ?? "";

    for (const snippet of ENGINE2_FORBIDDEN_SNIPPETS) {

      expect(inspectorText.toLowerCase()).not.toContain(snippet.toLowerCase());

    }

  });



  it("reveals timeline map behind secondary control", async () => {

    renderDiscovery(["iep_2024.pdf"]);

    await advanceProcessingToSettled();



    expect(screen.queryByTestId("document-structure-map")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("view-timeline-relationships"));

    expect(screen.getByTestId("document-structure-map")).toBeInTheDocument();

  });



  it("supports reduced motion without waiting for staged animations", async () => {

    mockMatchMedia(true);

    await act(async () => {

      renderDiscovery(["notes.pdf"]);

    });



    expect(screen.getByText("Your documents are organized.")).toBeInTheDocument();

    expect(screen.getByTestId("discovery-compact-inventory")).toBeInTheDocument();

  });

});

function buildObjectiveGateDiscoverResult(): HiveDiscoverResult {
  const discoverRunId = "run-objective-gate";
  const objectiveQuestionId = "question-objective";
  return {
    run: {
      discoverRunId,
      caseId: "case-1",
      idempotencyKey: "idem",
      providerId: "fixture",
      providerMode: "fixture",
      promptId: "discover",
      promptVersion: "discover-v2",
      promptSha256: "abc",
      domainPackId: "unknown",
      domainPackVersion: "unknown",
      startedAt: new Date().toISOString(),
      status: "NEEDS_OBJECTIVE_INPUT",
      phase: "AWAITING_OBJECTIVE",
    },
    collectionUnderstanding: {
      domainResolutionStatus: "SINGLE_DOMAIN",
      domainGroups: [
        {
          id: "group-iep",
          domainId: "iep",
          domainLabel: "Special Education (IEP)",
          logicalDocumentIds: ["ld-1"],
          description: "IEP-related records",
          suggestedObjectives: [
            { id: "obj-1", label: "Understand IEP services", summary: "Services and supports" },
            { id: "obj-2", label: "Prepare for a meeting", summary: "Meeting prep" },
            { id: "obj-3", label: "Track timelines", summary: "Deadlines" },
          ],
          suggestedAudiences: [
            { id: "aud-advocate", label: "My child's advocate", roleHint: "advocate" },
          ],
        },
      ],
      unresolvedAmbiguitySummary: null,
    },
    discoveryQuestions: [
      {
        id: objectiveQuestionId,
        questionKey: "discovery.objective",
        prompt: "What would you like Hive to help you accomplish?",
        humanReason: "Your choice guides emphasis only.",
        answerKind: "single_choice",
        options: [
          { id: "obj-1", label: "Understand IEP services" },
          { id: "objective.something_else", label: "Something else" },
        ],
        ambiguityKey: "objective",
        relatedLogicalDocumentIds: [],
        required: true,
      },
    ],
  };
}

function buildCompletedDiscoverResult(): HiveDiscoverResult {
  return {
    run: {
      discoverRunId: "run-complete",
      caseId: "case-1",
      idempotencyKey: "idem",
      providerId: "fixture",
      providerMode: "fixture",
      promptId: "discover",
      promptVersion: "discover-v2",
      promptSha256: "abc",
      domainPackId: "iep",
      domainPackVersion: "1",
      startedAt: new Date().toISOString(),
      status: "NEEDS_EVIDENCE_INPUT",
      phase: "AWAITING_EVIDENCE_DISPOSITIONS",
    },
    documentDiscovery: {
      domainLabel: "Special Education (IEP)",
      domainResolutionStatus: "resolved",
      groups: [],
      documents: [
        {
          id: "doc-1",
          documentType: "IEP",
          title: "Individualized Education Program",
          originalFilename: "iep_2024.pdf",
          sizeBytes: 100,
          familyRole: "primary",
          groupId: "g1",
          recognitionStatus: "recognized",
        },
      ],
      missingDocuments: [],
      relationships: [],
    },
  };
}

describe("DocumentDiscoveryExperience adaptive customer input", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockMatchMedia(false);
    vi.mocked(runDiscoverForStagedDocuments).mockReset();
    vi.mocked(continueDiscoverForStagedDocuments).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function renderAndWaitForDiscover(filenames: string[]) {
    const view = renderDiscovery(filenames);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    return view;
  }

  it("shows objective intake when Call #1 returns NEEDS_OBJECTIVE_INPUT", async () => {
    vi.mocked(runDiscoverForStagedDocuments).mockResolvedValue(buildObjectiveGateDiscoverResult());

    await renderAndWaitForDiscover(["iep_2024.pdf"]);

    expect(screen.getByTestId("discovery-objective-intake")).toBeInTheDocument();
    expect(screen.getByText("Understand IEP services")).toBeInTheDocument();
    expect(screen.queryByText("Your documents are organized.")).not.toBeInTheDocument();
  });

  it("keeps the workflow modal mounted while discover is gated before upload persist", async () => {
    const files = [new File(["content"], "iep_2024.pdf", { type: "application/pdf" })];
    const staged = createStagedDocuments(files);

    render(
      <StagedDocumentsProvider>
        <DocumentDiscoveryExperience
          stagedDocuments={staged}
          embedded
          processingModalOpen
          discoveryActive={false}
        />
      </StagedDocumentsProvider>,
    );

    expect(screen.getByTestId("discovery-workflow-modal")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });

    expect(screen.getByTestId("discovery-workflow-modal")).toBeInTheDocument();
    expect(screen.queryByText("Your documents are organized.")).not.toBeInTheDocument();
  });

  it("does not settle on the local fixture before discover API returns", async () => {
    let resolveDiscover!: (value: HiveDiscoverResult) => void;
    vi.mocked(runDiscoverForStagedDocuments).mockReturnValue(
      new Promise((resolve) => {
        resolveDiscover = resolve;
      }),
    );

    await renderAndWaitForDiscover(["iep_2024.pdf"]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(12000);
    });

    expect(screen.queryByText("Your documents are organized.")).not.toBeInTheDocument();
    expect(screen.getByTestId("discovery-processing-panel")).toBeInTheDocument();

    await act(async () => {
      resolveDiscover(buildObjectiveGateDiscoverResult());
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId("discovery-objective-intake")).toBeInTheDocument();
  });

  it("resumes processing after objective confirmation and shows audience step", async () => {
    vi.mocked(runDiscoverForStagedDocuments).mockResolvedValue(buildObjectiveGateDiscoverResult());
    vi.mocked(continueDiscoverForStagedDocuments).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(buildCompletedDiscoverResult()), 5000);
        }),
    );

    await renderAndWaitForDiscover(["iep_2024.pdf"]);

    fireEvent.click(screen.getByLabelText("Understand IEP services"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("Who is this primarily for?")).toBeInTheDocument();
    expect(screen.getByTestId("discovery-audience-options")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Just for me"));
    await act(async () => {
      fireEvent.click(
        within(screen.getByTestId("discovery-objective-intake")).getByRole("button", {
          name: "Continue",
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(continueDiscoverForStagedDocuments).toHaveBeenCalled();
    expect(screen.getByTestId("discovery-processing-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("discovery-objective-intake")).not.toBeInTheDocument();
  });

  it("shows clarification popup when Call #2 returns NEEDS_DISCOVERY_INPUT", async () => {
    const clarificationQuestionId = "clarify-1";
    vi.mocked(runDiscoverForStagedDocuments).mockResolvedValue(buildObjectiveGateDiscoverResult());
    vi.mocked(continueDiscoverForStagedDocuments).mockResolvedValue({
      ...buildObjectiveGateDiscoverResult(),
      run: {
        ...buildObjectiveGateDiscoverResult().run,
        status: "NEEDS_DISCOVERY_INPUT",
        phase: "AWAITING_DISCOVERY_ANSWERS",
      },
      documentDiscovery: undefined,
      discoveryQuestions: [
        {
          id: clarificationQuestionId,
          questionKey: "discovery.clarification",
          prompt: "Are these two evaluations for the same school year?",
          humanReason: "Timeline grouping depends on your answer.",
          answerKind: "single_choice",
          options: [
            { id: "yes", label: "Yes" },
            { id: "no", label: "No" },
          ],
          ambiguityKey: "chronology",
          relatedLogicalDocumentIds: [],
          required: true,
        },
      ],
    });

    await renderAndWaitForDiscover(["iep_2024.pdf"]);
    fireEvent.click(screen.getByLabelText("Understand IEP services"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByLabelText("Just for me"));
    await act(async () => {
      fireEvent.click(
        within(screen.getByTestId("discovery-objective-intake")).getByRole("button", {
          name: "Continue",
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId("discovery-customer-input-content")).toBeInTheDocument();
    expect(screen.getByText("Are these two evaluations for the same school year?")).toBeInTheDocument();
  });

  it("cycles processing modal content through objective, processing, and results", async () => {
    let resolveDiscover!: (value: HiveDiscoverResult) => void;
    vi.mocked(runDiscoverForStagedDocuments).mockReturnValue(
      new Promise((resolve) => {
        resolveDiscover = resolve;
      }),
    );
    vi.mocked(continueDiscoverForStagedDocuments).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(buildCompletedDiscoverResult()), 5000);
        }),
    );

    await renderAndWaitForDiscover(["iep_2024.pdf"]);

    expect(screen.getByTestId("discovery-workflow-modal")).toBeInTheDocument();
    expect(screen.getByTestId("discovery-processing-panel")).toBeInTheDocument();

    await act(async () => {
      resolveDiscover(buildObjectiveGateDiscoverResult());
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId("discovery-objective-intake")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Understand IEP services"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Who is this primarily for?")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Just for me"));
    await act(async () => {
      fireEvent.click(
        within(screen.getByTestId("discovery-objective-intake")).getByRole("button", {
          name: "Continue",
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId("discovery-workflow-modal")).toBeInTheDocument();
    expect(screen.getByTestId("discovery-processing-panel")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(16000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByTestId("discovery-workflow-modal")).not.toBeInTheDocument();
    expect(screen.getByText("Your documents are organized.")).toBeInTheDocument();
  });

  it("proceeds without clarification popup when Call #2 has no questions", async () => {
    vi.mocked(runDiscoverForStagedDocuments).mockResolvedValue(buildObjectiveGateDiscoverResult());
    vi.mocked(continueDiscoverForStagedDocuments).mockResolvedValue(buildCompletedDiscoverResult());

    await renderAndWaitForDiscover(["iep_2024.pdf"]);
    fireEvent.click(screen.getByLabelText("Understand IEP services"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByLabelText("Just for me"));
    await act(async () => {
      fireEvent.click(
        within(screen.getByTestId("discovery-objective-intake")).getByRole("button", {
          name: "Continue",
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(10000);
    });

    expect(screen.queryByTestId("discovery-customer-input-content")).not.toBeInTheDocument();
    expect(screen.getByText("Your documents are organized.")).toBeInTheDocument();
  });

  it("restores pending objective intake when discover API returns on retry", async () => {
    vi.mocked(runDiscoverForStagedDocuments).mockResolvedValue(buildObjectiveGateDiscoverResult());

    const { unmount } = renderDiscovery(["iep_2024.pdf"]);
    unmount();

    await renderAndWaitForDiscover(["iep_2024.pdf"]);
    expect(screen.getByTestId("discovery-objective-intake")).toBeInTheDocument();
  });
});

