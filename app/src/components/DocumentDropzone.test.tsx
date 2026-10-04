import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DocumentDropzone } from "./DocumentDropzone";

describe("DocumentDropzone", () => {
  it("links the primary CTA label to the hidden file input", () => {
    render(<DocumentDropzone />);

    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const label = screen.getByText("Choose documents").closest("label");

    expect(label).toHaveAttribute("for", input.id);
  });

  it("reports multiple selected files without listing document intelligence", async () => {
    const onFilesSelected = vi.fn();
    const files = [
      new File(["a"], "report.pdf", { type: "application/pdf" }),
      new File(["b"], "notes.txt", { type: "text/plain" }),
    ];

    render(<DocumentDropzone onFilesSelected={onFilesSelected} />);

    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    fireEvent.change(input, { target: { files } });

    expect(onFilesSelected).toHaveBeenCalledWith(files);
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("2 files selected.");
    });
  });

  it("sets drag-over state when files are dragged over", () => {
    render(<DocumentDropzone />);

    const dropzone = screen.getByTestId("document-dropzone");

    fireEvent.dragEnter(dropzone);

    expect(dropzone).toHaveAttribute("data-drag-over", "true");
  });
});
