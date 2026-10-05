import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CASE_VIEW_FIXTURE } from "@/lib/case/fixtures/case-view-fixture";

import { CustomerCaseView } from "./CustomerCaseView";
import { ViewSwitcher } from "./ViewSwitcher";
import { buildProvenanceIndex } from "@/lib/case/provenance-index";

describe("Case UI", () => {
  it("renders customer objective as non-evidence", () => {
    const view = {
      ...CASE_VIEW_FIXTURE.customerView,
      sections: [],
    };
    render(
      <CustomerCaseView
        view={view}
        claimsById={new Map()}
        conflictsById={new Map()}
        missingnessById={new Map()}
        provenance={buildProvenanceIndex(CASE_VIEW_FIXTURE.provenance)}
        eventsById={new Map()}
        selectedDomainId={null}
        onOpenEvidence={() => undefined}
      />,
    );
    expect(screen.getByText(/not evidence/i)).toBeTruthy();
    expect(screen.getByText(CASE_VIEW_FIXTURE.customerView.objectiveEcho!)).toBeTruthy();
  });

  it("switches customer and pro tabs", () => {
    const onChange = vi.fn();
    render(<ViewSwitcher mode="customer" onChange={onChange} />);
    screen.getByRole("tab", { name: "Pro" }).click();
    expect(onChange).toHaveBeenCalledWith("pro");
  });
});
