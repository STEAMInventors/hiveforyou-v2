import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

import { QuestionsExperience } from "./QuestionsExperience";
import { DocumentDiscoveryExperience } from "@/components/document-structure/DocumentDiscoveryExperience";
import { StagedDocumentsProvider } from "@/lib/intake/staged-documents-context";
import { createStagedDocuments } from "@/lib/staged-documents";
import { QUESTION_GROUP_LABELS } from "@/lib/questions/types";

const ENGINE2_FORBIDDEN_SNIPPETS = [
  "Canonical Study",
  "Case Genesis Pipeline",
  "Evidentiary Node Map",
  "OCR match",
  "verification engine",
  "Case Facts",
  "diagnosis",
  "eligibility",
  "service minutes",
  "Key Extracted",
];

function mockMatchMedia(reducedMotion: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("reduce") ? reducedMotion : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

function renderQuestions(filenames: string[]) {
  const files = filenames.map(
    (name) => new File(["content"], name, { type: "application/pdf" }),
  );
  const staged = createStagedDocuments(files);
  return render(
    <StagedDocumentsProvider initialDocuments={staged}>
      <QuestionsExperience />
    </StagedDocumentsProvider>,
  );
}

async function answerRequiredQuestions() {
  fireEvent.click(screen.getByTestId("missing-option-unavailable"));
  fireEvent.click(
    screen.getByRole("radio", { name: /Nothing important has changed/i }),
  );
  fireEvent.click(screen.getByTestId("intent-option-improving"));
}

describe("QuestionsExperience", () => {
  beforeEach(() => {
    mockMatchMedia(false);
  });

  it("renders three human question groups", () => {
    renderQuestions(["iep_2024.pdf", "eval_report.pdf", "speech_eval.pdf"]);

    expect(
      screen.getByTestId("question-group-complete_picture"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("question-group-understand_situation"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("question-group-what_matters")).toBeInTheDocument();

    expect(
      screen.getByRole("heading", {
        name: QUESTION_GROUP_LABELS.complete_picture,
      }),
    ).toBeInTheDocument();
  });

  it("supports missing document dispositions and updates compact map node", () => {
    renderQuestions(["iep_2024.pdf"]);

    const missingNode = () =>
      screen.getByTestId("compact-map-node-missing-progress-2023");

    expect(missingNode()).toHaveAttribute("data-map-state", "EXPECTED");

    fireEvent.click(screen.getByTestId("missing-option-unavailable"));
    expect(missingNode()).toHaveAttribute("data-map-state", "UNAVAILABLE");

    fireEvent.click(screen.getByTestId("missing-option-not_applicable"));
    expect(missingNode()).toHaveAttribute("data-map-state", "NOT_APPLICABLE");

    const file = new File(["pdf"], "progress_2023.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByTestId("missing-document-upload-input"), {
      target: { files: [file] },
    });
    expect(missingNode()).toHaveAttribute("data-map-state", "PROVIDED");
    expect(screen.getByTestId("missing-document-attachment")).toBeInTheDocument();
  });

  it("supports context unchanged vs changed with text", () => {
    renderQuestions(["iep_2024.pdf"]);
    fireEvent.click(
      screen.getByRole("radio", { name: /Yes, something has changed/i }),
    );
    fireEvent.change(screen.getByTestId("context-change-text"), {
      target: { value: "We moved districts." },
    });
    expect(screen.getByTestId("question-card-q-context-changes")).toHaveAttribute(
      "data-answered",
      "true",
    );
  });

  it("supports analysis intent multi-select", () => {
    renderQuestions(["iep_2024.pdf"]);
    fireEvent.click(screen.getByTestId("intent-option-improving"));
    fireEvent.click(screen.getByTestId("intent-option-over_time"));
    expect(screen.getByTestId("question-card-q-analysis-intent")).toHaveAttribute(
      "data-answered",
      "true",
    );
  });

  it("does not block completion on optional question", () => {
    renderQuestions(["iep_2024.pdf"]);
    answerRequiredQuestions();
    expect(screen.getByTestId("study-case-cta")).toHaveAttribute(
      "data-enabled",
      "true",
    );
  });

  it("disables Study my case until required questions are answered", () => {
    renderQuestions(["iep_2024.pdf"]);
    expect(screen.getByTestId("study-case-cta")).toHaveAttribute(
      "data-enabled",
      "false",
    );
  });

  it("enables Study my case when all required questions are answered", () => {
    renderQuestions(["iep_2024.pdf"]);
    answerRequiredQuestions();
    expect(screen.getByTestId("study-case-cta")).toHaveAttribute(
      "data-enabled",
      "true",
    );
    expect(
      screen.getByText("Hive has enough context to study your case."),
    ).toBeInTheDocument();
  });

  it("keeps answered questions editable", () => {
    renderQuestions(["iep_2024.pdf"]);
    fireEvent.click(screen.getByTestId("missing-option-unavailable"));
    expect(screen.getByTestId("question-card-q-missing-progress")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("missing-option-not_applicable"));
    expect(screen.getByTestId("question-card-q-missing-progress")).toHaveAttribute(
      "data-answered",
      "true",
    );
  });

  it("does not surface Engine 2 or technical pipeline language", () => {
    renderQuestions(["iep_2024.pdf", "eval_report.pdf"]);
    answerRequiredQuestions();
    const text = document.body.textContent ?? "";
    for (const snippet of ENGINE2_FORBIDDEN_SNIPPETS) {
      expect(text).not.toContain(snippet);
    }
  });

  it("renders compact map without depending on motion for layout", () => {
    mockMatchMedia(true);
    renderQuestions(["iep_2024.pdf"]);
    expect(screen.getByTestId("compact-document-structure-map")).toBeInTheDocument();
  });
});

describe("V2-001C → V2-001D entry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockMatchMedia(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("Answer a few questions links to Questions route", async () => {
    const staged = createStagedDocuments([
      new File(["x"], "iep_2024.pdf", { type: "application/pdf" }),
    ]);
    render(
      <StagedDocumentsProvider initialDocuments={staged}>
        <DocumentDiscoveryExperience stagedDocuments={staged} />
      </StagedDocumentsProvider>,
    );

    expect(screen.getByTestId("answer-questions-cta")).toHaveAttribute(
      "href",
      "/questions",
    );
  });
});
