import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StagedDocumentsProvider } from "@/lib/intake/staged-documents-context";

import { UploadExperience } from "./UploadExperience";

const mockPush = vi.fn();

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
    push: mockPush,
  }),
}));

vi.mock("@/lib/documents/commit-client", () => ({
  commitStagedDocuments: vi.fn(async (docs: { id: string }[]) => ({
    caseId: "00000000-0000-4000-8000-000000000001",
    documents: docs.map((doc) => ({
      stagedDocumentId: doc.id,
      sourceDocumentId: doc.id,
    })),
  })),
}));

vi.mock("@/lib/document-discovery/run-discover-client", () => ({
  runDiscoverForStagedDocuments: vi.fn(),
  continueDiscoverForStagedDocuments: vi.fn(),
}));

import { commitStagedDocuments } from "@/lib/documents/commit-client";
import { runDiscoverForStagedDocuments } from "@/lib/document-discovery/run-discover-client";

function renderUploadExperience() {
  return render(
    <StagedDocumentsProvider>
      <UploadExperience />
    </StagedDocumentsProvider>,
  );
}

function selectFilesViaDropzone(filenames: { name: string; size?: number }[]) {
  const files = filenames.map(
    ({ name, size = 1024 }) =>
      new File(["x".repeat(size)], name, {
        type: name.endsWith(".pdf") ? "application/pdf" : "text/plain",
      }),
  );

  const input = document.querySelector(
    'input[type="file"]:not([id*="Add"])',
  ) as HTMLInputElement;

  if (!input) {
    const inputs = document.querySelectorAll('input[type="file"]');
    fireEvent.change(inputs[0] as HTMLInputElement, { target: { files } });
  } else {
    fireEvent.change(input, { target: { files } });
  }

  return files;
}

function selectMoreFiles(filenames: string[]) {
  const files = filenames.map(
    (name) => new File(["y"], name, { type: "application/pdf" }),
  );
  const label = screen.getByText("Add more documents").closest("label");
  expect(label).not.toBeNull();
  const input = label!.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files } });
  return files;
}

describe("UploadExperience", () => {
  beforeEach(() => {
    mockMatchMedia(false);
    vi.mocked(commitStagedDocuments).mockImplementation(async (docs: { id: string }[]) => ({
      caseId: "00000000-0000-4000-8000-000000000001",
      documents: docs.map((doc) => ({
        stagedDocumentId: doc.id,
        sourceDocumentId: doc.id,
      })),
    }));
    vi.mocked(runDiscoverForStagedDocuments).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("transitions from Empty Upload to Documents Added when files are selected", () => {
    renderUploadExperience();

    expect(
      screen.getByText("Turn your documents into something you can understand."),
    ).toBeInTheDocument();

    selectFilesViaDropzone([{ name: "report.pdf" }]);

    expect(screen.getByText("Your documents are ready.")).toBeInTheDocument();
    expect(screen.queryByTestId("document-dropzone")).not.toBeInTheDocument();
  });

  it("shows actual filenames and formatted sizes", () => {
    renderUploadExperience();

    selectFilesViaDropzone([{ name: "my_notes.pdf", size: 2048 }]);

    expect(screen.getByText("my_notes.pdf")).toBeInTheDocument();
    expect(screen.getByText(/2 KB · PDF/)).toBeInTheDocument();
    expect(screen.getByText("1 document selected")).toBeInTheDocument();
  });

  it("updates collection and count when a file is removed", () => {
    renderUploadExperience();

    selectFilesViaDropzone([
      { name: "a.pdf" },
      { name: "b.pdf" },
    ]);

    expect(screen.getByText("2 documents selected")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove a.pdf" }));

    expect(screen.queryByText("a.pdf")).not.toBeInTheDocument();
    expect(screen.getByText("b.pdf")).toBeInTheDocument();
    expect(screen.getByText("1 document selected")).toBeInTheDocument();
  });

  it("returns to Empty Upload when the last file is removed", () => {
    renderUploadExperience();

    selectFilesViaDropzone([{ name: "only.pdf" }]);
    fireEvent.click(screen.getByRole("button", { name: "Remove only.pdf" }));

    expect(screen.getByTestId("document-dropzone")).toBeInTheDocument();
    expect(
      screen.getByText("Turn your documents into something you can understand."),
    ).toBeInTheDocument();
  });

  it("appends documents via Add more documents", () => {
    renderUploadExperience();

    selectFilesViaDropzone([{ name: "first.pdf" }]);
    selectMoreFiles(["second.pdf"]);

    expect(screen.getByText("first.pdf")).toBeInTheDocument();
    expect(screen.getByText("second.pdf")).toBeInTheDocument();
    expect(screen.getByText("2 documents selected")).toBeInTheDocument();
  });

  it("retains multiple files from an initial multi-select", () => {
    renderUploadExperience();

    selectFilesViaDropzone([
      { name: "one.pdf" },
      { name: "two.pdf" },
      { name: "three.pdf" },
    ]);

    const list = screen.getByRole("list", { name: "Selected documents" });
    expect(within(list).getByText("one.pdf")).toBeInTheDocument();
    expect(within(list).getByText("two.pdf")).toBeInTheDocument();
    expect(within(list).getByText("three.pdf")).toBeInTheDocument();
    expect(screen.getByText("3 documents selected")).toBeInTheDocument();
  });

  it("starts in-place discovery modal when Understand my documents is clicked", async () => {
    mockPush.mockClear();
    renderUploadExperience();

    selectFilesViaDropzone([{ name: "iep.pdf" }]);
    fireEvent.click(screen.getByTestId("understand-documents-cta"));

    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByTestId("discovery-workflow-modal")).toBeInTheDocument();
    expect(screen.getByTestId("staged-documents-compact-list")).toBeInTheDocument();
  });

  it("shows the workflow modal immediately on Process before persist and discover resolve", async () => {
    vi.useFakeTimers();
    mockPush.mockClear();

    let resolveCommit!: (value: Awaited<ReturnType<typeof commitStagedDocuments>>) => void;
    vi.mocked(commitStagedDocuments).mockReturnValue(
      new Promise((resolve) => {
        resolveCommit = resolve;
      }),
    );
    vi.mocked(runDiscoverForStagedDocuments).mockReturnValue(new Promise(() => {}));

    renderUploadExperience();
    selectFilesViaDropzone([{ name: "iep.pdf" }]);

    fireEvent.click(screen.getByTestId("understand-documents-cta"));

    expect(screen.getByTestId("discovery-workflow-modal")).toBeInTheDocument();
    expect(screen.getByTestId("discovery-processing-panel")).toBeInTheDocument();
    expect(runDiscoverForStagedDocuments).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });

    expect(screen.getByTestId("discovery-workflow-modal")).toBeInTheDocument();
    expect(screen.queryByText("Your documents are organized.")).not.toBeInTheDocument();

    await act(async () => {
      resolveCommit({
        caseId: "00000000-0000-4000-8000-000000000001",
        documents: [{ stagedDocumentId: "x", sourceDocumentId: "x" }],
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    vi.useRealTimers();
  });
});
