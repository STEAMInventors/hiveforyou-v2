import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import type { CaseMapViewBundle } from "@/lib/case-map/case-map-view-bundle";
import { l001CaseMapViewFixture } from "@/lib/case-map/fixtures/l001-case-map-fixture";

import { CaseMapExperience } from "./CaseMapExperience";

vi.mock("@/lib/case-map/case-map-client", () => ({
  fetchCaseMapViewBundle: vi.fn(),
}));

vi.mock("@/lib/case-map/use-media-query", () => ({
  useMediaQuery: () => true,
}));

import { fetchCaseMapViewBundle } from "@/lib/case-map/case-map-client";

describe("CaseMapExperience mobile fallback", () => {
  beforeEach(() => {
    vi.mocked(fetchCaseMapViewBundle).mockReset();
  });

  it("defaults to outline on narrow screens", async () => {
    const { caseMap, provenance, proView } = l001CaseMapViewFixture();
    const bundle: CaseMapViewBundle = {
      studyRunId: "l001-run",
      caseId: "l001-case",
      status: "SUCCEEDED",
      caseMap,
      provenance,
      proView,
      caseView: null,
      canonicalSnapshot: null,
    };
    render(<CaseMapExperience studyRunId="l001-run" initialBundle={bundle} />);
    await waitFor(() => {
      expect(screen.getByTestId("case-map-outline")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("living-case-map")).not.toBeInTheDocument();
  });
});
