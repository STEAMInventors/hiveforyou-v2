import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { l001LikeCanonicalSnapshot, projectCaseViewV2Minimal } from "@hiveforyou/core";

import type { CaseMapViewBundle } from "@/lib/case-map/case-map-view-bundle";
import { l001CaseMapViewFixture } from "@/lib/case-map/fixtures/l001-case-map-fixture";

import { CaseSummaryProView } from "../CaseSummaryProView";

function readyBundle(): CaseMapViewBundle {
  const { caseMap, provenance, proView } = l001CaseMapViewFixture();
  const canonicalSnapshot = l001LikeCanonicalSnapshot();
  const caseView = projectCaseViewV2Minimal({ intelligence: canonicalSnapshot, provenance });
  return {
    studyRunId: "l001-run",
    caseId: "l001-case",
    status: "SUCCEEDED",
    caseMap,
    provenance,
    proView,
    caseView,
    canonicalSnapshot,
  };
}

describe("ProPage workspace", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows ranked views with Suggested on the first rail button", async () => {
    render(
      <CaseSummaryProView
        caseId="l001-case"
        studyRunId="l001-run"
        bundle={readyBundle()}
        summary={{
          domainLabel: "IEP",
          documentCount: 9,
          changesSectionTitle: "",
          decisions: [],
          changes: [],
          gaps: [],
          checkedPreview: [],
          statusCounts: { needs: 0, changed: 0, missing: 0, checked: 0 },
        }}
        claimsById={new Map()}
        provenance={null}
        documentLabels={[]}
        onOpen={() => {}}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/Suggested/)).toBeInTheDocument();
    });
    expect(screen.getAllByRole("button", { name: /Meeting brief|Prior vs proposed|Trends|Evidence ledger/i }).length).toBeGreaterThan(0);
  });

  it("hides reconfirmed rows when hide-same is toggled", async () => {
    render(
      <CaseSummaryProView
        caseId="l001-case"
        studyRunId="l001-run"
        bundle={readyBundle()}
        summary={{
          domainLabel: "IEP",
          documentCount: 9,
          changesSectionTitle: "",
          decisions: [],
          changes: [],
          gaps: [],
          checkedPreview: [],
          statusCounts: { needs: 0, changed: 0, missing: 0, checked: 0 },
        }}
        claimsById={new Map()}
        provenance={null}
        documentLabels={[]}
        onOpen={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Prior vs proposed/i }));
    const toggle = await screen.findByTestId("pro-hide-same-toggle");
    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
  });
});
