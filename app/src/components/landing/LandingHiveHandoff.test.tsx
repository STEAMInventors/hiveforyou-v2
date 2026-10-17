import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LandingHiveHandoff } from "./LandingHiveHandoff";

vi.mock("@/lib/cases/cases-client", () => ({
  fetchOwnedHives: vi.fn(),
  fetchOwnedHive: vi.fn(),
  OwnedHivesFetchError: class OwnedHivesFetchError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

import { fetchOwnedHive, fetchOwnedHives } from "@/lib/cases/cases-client";

const DRAFT_CASE_ID = "11111111-1111-4111-8111-111111111111";

async function fillAndCreateHive(name: string) {
  fireEvent.click(screen.getByTestId("landing-hive-handoff-create"));
  await waitFor(() => {
    expect(screen.getByTestId("landing-create-hive-modal")).toBeInTheDocument();
  });
  fireEvent.change(screen.getByTestId("landing-create-hive-name"), {
    target: { value: name },
  });
  fireEvent.click(screen.getByTestId("landing-create-hive-submit"));
}

describe("LandingHiveHandoff", () => {
  beforeEach(() => {
    vi.mocked(fetchOwnedHives).mockReset();
    vi.mocked(fetchOwnedHive).mockReset();
  });

  it("does not call owned-hive APIs in preview mode", async () => {
    const onContinue = vi.fn();
    render(
      <LandingHiveHandoff
        fileCount={2}
        composerExplicitDomainId="iep"
        explicitDomainLabel="Special Education / IEP"
        previewMode
        draftCaseId={DRAFT_CASE_ID}
        onBack={() => undefined}
        onContinue={onContinue}
      />,
    );

    expect(screen.getByTestId("landing-hive-handoff-preview-mode-banner")).toBeInTheDocument();
    expect(screen.queryByTestId("landing-hive-handoff-mode-existing")).toBeNull();
    expect(fetchOwnedHives).not.toHaveBeenCalled();

    await fillAndCreateHive("Maya's IEP 2025-26");
    expect(onContinue).toHaveBeenCalledWith({
      caseId: DRAFT_CASE_ID,
      selectionIntent: "new",
      hiveName: "Maya's IEP 2025-26",
      hiveDescription: null,
    });
  });

  it("blocks submit when the hive name is blank", async () => {
    const onContinue = vi.fn();
    render(
      <LandingHiveHandoff
        fileCount={1}
        composerExplicitDomainId="iep"
        explicitDomainLabel="Special Education / IEP"
        previewMode
        draftCaseId={DRAFT_CASE_ID}
        onBack={() => undefined}
        onContinue={onContinue}
      />,
    );

    fireEvent.click(screen.getByTestId("landing-hive-handoff-create"));
    await waitFor(() => {
      expect(screen.getByTestId("landing-create-hive-modal")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("landing-create-hive-submit"));

    expect(screen.getByTestId("landing-create-hive-name-error")).toHaveTextContent(
      /give your hive a name/i,
    );
    expect(onContinue).not.toHaveBeenCalled();
  });

  it("preserves draft fields from initialDraft when reopening the modal", async () => {
    render(
      <LandingHiveHandoff
        fileCount={1}
        composerExplicitDomainId="iep"
        explicitDomainLabel="Special Education / IEP"
        previewMode
        draftCaseId={DRAFT_CASE_ID}
        initialDraft={{
          caseId: DRAFT_CASE_ID,
          hiveName: "Saved draft name",
          hiveDescription: "Saved draft description",
        }}
        onBack={() => undefined}
        onContinue={() => undefined}
      />,
    );

    fireEvent.click(screen.getByTestId("landing-hive-handoff-create"));
    await waitFor(() => {
      expect(screen.getByTestId("landing-create-hive-name")).toHaveValue("Saved draft name");
    });
    expect(screen.getByTestId("landing-create-hive-description")).toHaveValue(
      "Saved draft description",
    );
  });

  it("keeps the same case id after a validation failure", async () => {
    const onContinue = vi.fn();
    render(
      <LandingHiveHandoff
        fileCount={1}
        composerExplicitDomainId="iep"
        explicitDomainLabel="Special Education / IEP"
        draftCaseId={DRAFT_CASE_ID}
        onBack={() => undefined}
        onContinue={onContinue}
      />,
    );

    fireEvent.click(screen.getByTestId("landing-hive-handoff-create"));
    await waitFor(() => {
      expect(screen.getByTestId("landing-create-hive-modal")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("landing-create-hive-submit"));
    expect(onContinue).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId("landing-create-hive-name"), {
      target: { value: "Annual review prep" },
    });
    fireEvent.click(screen.getByTestId("landing-create-hive-submit"));
    expect(onContinue).toHaveBeenCalledWith(
      expect.objectContaining({ caseId: DRAFT_CASE_ID, hiveName: "Annual review prep" }),
    );
  });
});
