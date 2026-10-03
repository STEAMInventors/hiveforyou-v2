import { describe, expect, it } from "vitest";

import { CASE_VIEW_V2_SCHEMA } from "@hiveforyou/shared/projections";

import { l001CaseViewV2ProjectionLogicalDocuments } from "./fixtures/l001-case-view-v2-projection";
import { l001CaseViewV2ProjectionSnapshot } from "./fixtures/l001-case-view-v2-projection";
import { projectCaseViewV2Minimal } from "./project-case-view-v2-minimal";
import { buildRulebookDocumentExplainers } from "./build-rulebook-document-explainers";

describe("buildRulebookDocumentExplainers", () => {
  it("builds one explainer tab per in-case document that has a rulebook guide", () => {
    const view = projectCaseViewV2Minimal({
      intelligence: l001CaseViewV2ProjectionSnapshot(),
      logicalDocuments: l001CaseViewV2ProjectionLogicalDocuments(),
      userText: "Prepare for IEP meeting",
    });
    expect(view.schemaVersion).toBe(CASE_VIEW_V2_SCHEMA);

    const explainers = buildRulebookDocumentExplainers({
      caseView: view,
      domainPackId: "iep",
    });

    expect(explainers.length).toBeGreaterThanOrEqual(2);
    for (const explainer of explainers) {
      expect(explainer.tabId.startsWith("doc:")).toBe(true);
      expect(explainer.sections.length).toBeGreaterThan(0);
      expect(explainer.intro).toContain("rules");
    }

    const iepExplainer = explainers.find((e) => e.tabLabel.toLowerCase().includes("iep"));
    expect(iepExplainer?.pageTitle).toMatch(/IEP/i);
    const goalsSection = iepExplainer?.sections.find((s) => s.id === "goals");
    expect(goalsSection?.terms.length).toBeGreaterThan(0);
    expect(goalsSection?.statusLabel).toBeTruthy();
    expect(iepExplainer?.meta.domainPill).toBeTruthy();
    expect(iepExplainer?.dates.some((d) => d.id === "annualReview")).toBe(true);
  });
});
