import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CaseWorkspaceChrome } from "@/components/hive-customer/HiveCaseWorkspaceChrome";

import {
  buildCaseCanonicalStudyHref,
  buildCaseDocumentsHref,
  buildCaseReportsHref,
  buildCaseWorkspaceHomeHref,
  buildHiveBuildingHref,
  buildMyCasesHref,
  buildOwnedHiveDocumentsHref,
  ownedHiveWorkspaceNavInput,
  buildPostStudyCompletionHref,
  isCanonicalStudyPresentationReady,
  isCaseWorkspaceSectionNavEnabled,
  isPackDrivenStudyAwaitingRawExtraction,
  parseCaseDocumentsView,
  resolveCaseWorkspaceSectionFromPathname,
  resolveStudyProcessingModeFromStudyPath,
  withCaseDocumentsView,
} from "./study-completion-navigation";

describe("study-completion-navigation", () => {
  it("maps DOMAIN_PACK intake runs to pack_driven_v1", () => {
    expect(resolveStudyProcessingModeFromStudyPath("DOMAIN_PACK")).toBe("pack_driven_v1");
    expect(resolveStudyProcessingModeFromStudyPath("GENERIC_STUDY")).toBe("canonical_openai_v4");
    expect(resolveStudyProcessingModeFromStudyPath(undefined)).toBe("canonical_openai_v4");
  });

  it("routes pack_driven completion to raw extractions on the customer ready screen", () => {
    expect(
      buildPostStudyCompletionHref({
        processingMode: "pack_driven_v1",
        caseId: "case-1",
        studyRunId: "study-1",
      }),
    ).toBe("/hives/case-1/ready?studyRunId=study-1&documentsView=raw-extractions");
  });

  it("opens hive building on raw extractions by default", () => {
    expect(
      buildHiveBuildingHref({
        caseId: "case-1",
        studyRunId: "study-1",
      }),
    ).toBe("/hives/case-1/building?studyRunId=study-1&documentsView=raw-extractions");
  });

  it("routes canonical completion to the study map", () => {
    expect(
      buildPostStudyCompletionHref({
        processingMode: "canonical_openai_v4",
        caseId: "case-1",
        studyRunId: "study-1",
      }),
    ).toBe("/study/study-1/map");
  });

  it("builds My Hives card hrefs from owned hive workspace data", () => {
    const hiveWithRuns = {
      caseId: "case-1",
      domainId: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      workspace: {
        intakeRunId: "intake-1",
        studyRunId: "study-1",
        studyRunStatus: "SUCCEEDED" as const,
      },
    };
    const hiveEmpty = {
      ...hiveWithRuns,
      caseId: "case-2",
      workspace: {
        intakeRunId: null,
        studyRunId: null,
        studyRunStatus: null,
      },
    };

    expect(buildOwnedHiveDocumentsHref(hiveWithRuns)).toContain("/hives/case-1/ready");
    expect(buildOwnedHiveDocumentsHref(hiveWithRuns)).toContain("studyRunId=study-1");
    expect(buildOwnedHiveDocumentsHref(hiveWithRuns)).toContain("intakeRunId=intake-1");
    expect(buildOwnedHiveDocumentsHref(hiveEmpty)).toBe("/hives/case-2/ready");
    expect(ownedHiveWorkspaceNavInput(hiveWithRuns)).toEqual({
      caseId: "case-1",
      studyRunId: "study-1",
      intakeRunId: "intake-1",
    });
  });

  it("builds case workspace navigation hrefs", () => {
    const base = {
      caseId: "case-1",
      studyRunId: "study-1",
      intakeRunId: "intake-1",
      audience: "customer" as const,
    };
    expect(buildMyCasesHref()).toBe("/case");
    expect(buildCaseWorkspaceHomeHref(base)).toContain("/ready");
    expect(buildCaseWorkspaceHomeHref(base)).toContain("studyRunId=study-1");
    expect(buildCaseDocumentsHref(base)).toContain("/hives/case-1/ready");
    expect(buildCaseDocumentsHref(base)).toContain("studyRunId=study-1");
    expect(buildCaseDocumentsHref(base)).not.toContain("documentsView=raw-extractions");
    expect(buildCaseDocumentsHref(base)).not.toContain("/intake/");
    expect(buildCaseCanonicalStudyHref(base)).toContain("/canonical-json");
    expect(buildCaseReportsHref(base)).toContain("/report-preview");
    expect(resolveCaseWorkspaceSectionFromPathname("/hives/case-1/report-preview")).toBe("reports");
    expect(isCaseWorkspaceSectionNavEnabled("reports", { caseId: "c", studyRunId: "s" })).toBe(true);
  });

  it("preserves breadcrumb path and merges query params on report preview hrefs", () => {
    const href = buildCaseReportsHref({
      caseId: "case-1",
      studyRunId: "study-1",
      intakeRunId: "intake-1",
      audience: "pro",
    });
    expect(href.startsWith("/hives/case-1/report-preview?")).toBe(true);
    expect(href).toContain("studyRunId=study-1");
    expect(href).toContain("intakeRunId=intake-1");
    expect(href).toContain("audience=pro");
  });

  it("returns a path-only workspace home href when studyRunId is missing", () => {
    expect(buildCaseWorkspaceHomeHref({ caseId: "case-1" })).toBe("/hives/case-1/ready");
  });

  it("parses documents sub-view query params for the Documents section", () => {
    expect(parseCaseDocumentsView(undefined)).toBe("files");
    expect(parseCaseDocumentsView("raw-extractions")).toBe("raw-extractions");
    expect(withCaseDocumentsView("/intake/run-1?studyRunId=s1", "raw-extractions")).toContain(
      "documentsView=raw-extractions",
    );
  });

  it("renders compact workspace chrome breadcrumbs and underline section tabs", () => {
    render(
      createElement(CaseWorkspaceChrome, {
        caseId: "case-1",
        studyRunId: "study-1",
        intakeRunId: "intake-1",
        caseLabel: "Maya",
        activeSection: "documents",
      }),
    );

    const breadcrumbs = screen.getByTestId("case-workspace-breadcrumbs");
    expect(breadcrumbs).toHaveTextContent("My Hives");
    expect(breadcrumbs).toHaveTextContent("Maya");
    expect(breadcrumbs).not.toHaveTextContent("Canonical Study");

    expect(screen.getByTestId("case-workspace-section-nav").querySelector('[aria-current="page"]')).toHaveTextContent(
      "Documents",
    );
  });

  it("routes Documents section tabs to the hive document inventory, not intake", () => {
    render(
      createElement(CaseWorkspaceChrome, {
        caseId: "case-1",
        studyRunId: "study-1",
        intakeRunId: "intake-1",
        caseLabel: "Maya",
        activeSection: "canonical-study",
      }),
    );

    const documentsLink = screen.getByRole("link", { name: "Documents" });
    expect(documentsLink.getAttribute("href")).toContain("/hives/case-1/ready");
    expect(documentsLink.getAttribute("href")).not.toContain("/intake/");
  });

  it("distinguishes canonical presentation readiness from pack-driven polling", () => {
    expect(isCanonicalStudyPresentationReady("SUCCEEDED")).toBe(true);
    expect(isCanonicalStudyPresentationReady("NEEDS_REVIEW")).toBe(true);
    expect(isCanonicalStudyPresentationReady("FAILED")).toBe(false);
    expect(isPackDrivenStudyAwaitingRawExtraction("RUNNING")).toBe(true);
    expect(isPackDrivenStudyAwaitingRawExtraction("SUCCEEDED")).toBe(false);
  });
});
