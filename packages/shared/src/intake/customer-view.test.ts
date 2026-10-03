import { describe, expect, it } from "vitest";

import { computeIntakeWorkspaceReady, toIntakeCustomerView } from "./customer-view";

describe("computeIntakeWorkspaceReady", () => {
  it("requires persisted normalized extraction for classified documents", () => {
    expect(
      computeIntakeWorkspaceReady("SUCCEEDED", [
        {
          processingStatus: "CLASSIFIED",
          hasNormalizedExtraction: false,
        },
      ]),
    ).toBe(false);
    expect(
      computeIntakeWorkspaceReady("SUCCEEDED", [
        {
          processingStatus: "CLASSIFIED",
          hasNormalizedExtraction: true,
        },
      ]),
    ).toBe(true);
  });

  it("does not block workspace when extraction failed before normalized artifact", () => {
    expect(
      computeIntakeWorkspaceReady("FAILED", [
        {
          processingStatus: "FAILED",
          errorCode: "EXTRACTION_FAILED",
          hasNormalizedExtraction: false,
        },
      ]),
    ).toBe(true);
  });
});

describe("toIntakeCustomerView", () => {
  it("includes filename, size, and workspace readiness", () => {
    const view = toIntakeCustomerView(
      { id: "run-1", status: "SUCCEEDED" },
      [
        {
          sourceDocumentId: "doc-1",
          processingStatus: "CLASSIFIED",
          proposedType: "bank_statement",
          filename: "statement.pdf",
          sizeBytes: 2048,
          hasNormalizedExtraction: true,
        },
      ],
    );
    expect(view.workspaceReady).toBe(true);
    expect(view.documents[0]).toMatchObject({
      filename: "statement.pdf",
      sizeBytes: 2048,
      label: "Bank statement",
    });
  });
});
