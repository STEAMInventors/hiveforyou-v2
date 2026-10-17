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

const EXISTING_CASE = "33333333-3333-4333-8333-333333333333";

describe("LandingHiveHandoff", () => {
  beforeEach(() => {
    vi.mocked(fetchOwnedHives).mockReset();
    vi.mocked(fetchOwnedHive).mockReset();
  });

  it("blocks domain-mismatched hives from selection", async () => {
    vi.mocked(fetchOwnedHives).mockResolvedValue({
      cases: [
        {
          caseId: EXISTING_CASE,
          domainId: "medicaid",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
      ],
    });

    render(
      <LandingHiveHandoff
        fileCount={1}
        composerExplicitDomainId="iep"
        onBack={() => undefined}
        onContinue={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("landing-hive-handoff-domain-blocked")).toBeInTheDocument();
    });
    expect(screen.queryByTestId(`landing-hive-handoff-option-${EXISTING_CASE}`)).toBeNull();
  });

  it("confirms ownership before continuing with an existing hive", async () => {
    vi.mocked(fetchOwnedHives).mockResolvedValue({
      cases: [
        {
          caseId: EXISTING_CASE,
          domainId: "iep",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
      ],
    });
    vi.mocked(fetchOwnedHive).mockResolvedValue({
      caseId: EXISTING_CASE,
      domainId: "iep",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    const onContinue = vi.fn();

    render(
      <LandingHiveHandoff
        fileCount={1}
        composerExplicitDomainId="iep"
        onBack={() => undefined}
        onContinue={onContinue}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("landing-hive-handoff-mode-existing")).toBeEnabled();
    });
    fireEvent.click(screen.getByTestId("landing-hive-handoff-mode-existing"));
    fireEvent.click(screen.getByTestId(`landing-hive-handoff-option-${EXISTING_CASE}`));
    fireEvent.click(screen.getByTestId("landing-hive-handoff-continue"));

    await waitFor(() => {
      expect(fetchOwnedHive).toHaveBeenCalledWith(EXISTING_CASE);
    });
    expect(onContinue).toHaveBeenCalledWith({
      caseId: EXISTING_CASE,
      selectionIntent: "existing",
    });
  });
});
