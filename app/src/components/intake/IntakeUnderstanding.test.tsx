import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentCommitError } from "@/lib/documents/commit-errors";

const { commitStagedDocuments, signInWithGoogle } = vi.hoisted(() => ({
  commitStagedDocuments: vi.fn(),
  signInWithGoogle: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("@/lib/intake/staged-documents-context", () => ({
  useStagedDocuments: () => ({
    documents: [
      {
        id: "staged-1",
        file: new File(["a"], "a.pdf", { type: "application/pdf" }),
      },
    ],
  }),
}));

vi.mock("@/lib/documents/commit-client", () => ({
  commitStagedDocuments,
}));

vi.mock("@/lib/intake/intake-client", () => ({
  clearStoredIntakeRun: vi.fn(),
  fetchIntakeRun: vi.fn(),
  startIntakeRun: vi.fn(),
}));

vi.mock("@/lib/auth/google-sign-in", () => ({
  signInWithGoogle,
}));

import { IntakeUnderstanding } from "./IntakeUnderstanding";

describe("IntakeUnderstanding upload auth", () => {
  beforeEach(() => {
    commitStagedDocuments.mockReset();
    signInWithGoogle.mockReset();
    signInWithGoogle.mockResolvedValue(undefined);
  });

  it("shows Sign in with Google when the upload has no Supabase session", async () => {
    commitStagedDocuments.mockRejectedValue(new DocumentCommitError("UNAUTHENTICATED"));

    render(<IntakeUnderstanding onDismiss={vi.fn()} />);

    expect(await screen.findByRole("heading", { name: "Sign in to upload" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Sign in with Google to upload your documents.",
    );
    expect(screen.queryByText(/couldn't save your documents/i)).not.toBeInTheDocument();

    screen.getByTestId("google-sign-in").click();
    expect(signInWithGoogle).toHaveBeenCalled();
  });

  it("keeps the generic save message for other upload failures", async () => {
    commitStagedDocuments.mockRejectedValue(new DocumentCommitError("DOCUMENT_COMMIT_FAILED"));

    render(<IntakeUnderstanding />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't save your documents. Please try again.",
    );
    expect(screen.queryByTestId("google-sign-in")).not.toBeInTheDocument();
  });
});
