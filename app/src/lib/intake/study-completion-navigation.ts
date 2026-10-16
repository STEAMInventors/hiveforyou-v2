import type { StudyProcessingMode, StudyRunStatus } from "@hiveforyou/shared/canonical-study";
import { isStudyRunProcessing } from "@hiveforyou/shared/canonical-study";
import type { IntakeStudyPath } from "@hiveforyou/shared/intake";

export function resolveStudyProcessingModeFromStudyPath(
  studyPath: IntakeStudyPath | undefined,
): StudyProcessingMode {
  return studyPath === "DOMAIN_PACK" ? "pack_driven_v1" : "canonical_openai_v4";
}

export function buildHiveBuildingHref(input: { caseId: string; studyRunId: string }): string {
  return `/hives/${encodeURIComponent(input.caseId)}/building?studyRunId=${encodeURIComponent(input.studyRunId)}`;
}

export function buildHiveReadyHref(input: { caseId: string; studyRunId: string }): string {
  return `/hives/${encodeURIComponent(input.caseId)}/ready?studyRunId=${encodeURIComponent(input.studyRunId)}`;
}

export function buildHiveCanonicalJsonHref(input: { caseId: string; studyRunId: string }): string {
  return `/hives/${encodeURIComponent(input.caseId)}/canonical-json?studyRunId=${encodeURIComponent(input.studyRunId)}`;
}

export function buildHiveReportPreviewHref(input: {
  caseId: string;
  studyRunId: string;
  audience?: "customer" | "pro";
}): string {
  const audience = input.audience ?? "customer";
  return `/hives/${encodeURIComponent(input.caseId)}/report-preview?studyRunId=${encodeURIComponent(input.studyRunId)}&audience=${encodeURIComponent(audience)}`;
}

export function buildPostStudyCompletionHref(input: {
  processingMode: StudyProcessingMode;
  caseId: string;
  studyRunId: string;
}): string {
  if (input.processingMode === "pack_driven_v1") {
    return buildHiveReadyHref({ caseId: input.caseId, studyRunId: input.studyRunId });
  }
  return `/study/${encodeURIComponent(input.studyRunId)}/map`;
}

export function isCanonicalStudyPresentationReady(status: StudyRunStatus): boolean {
  return status === "SUCCEEDED" || status === "NEEDS_REVIEW";
}

export function isPackDrivenStudyAwaitingRawExtraction(status: StudyRunStatus): boolean {
  return isStudyRunProcessing(status);
}

export type CaseWorkspaceSection = "case" | "documents" | "canonical-study" | "reports";

export type CaseWorkspaceAudience = "customer" | "pro";

export type CaseWorkspaceNavInput = {
  caseId: string;
  studyRunId?: string;
  intakeRunId?: string | null;
  audience?: CaseWorkspaceAudience;
  caseLabel?: string | null;
};

export function buildMyCasesHref(): string {
  return "/case";
}

function appendWorkspaceQueryParams(pathname: string, input: CaseWorkspaceNavInput): string {
  const queryIndex = pathname.indexOf("?");
  const basePath = queryIndex === -1 ? pathname : pathname.slice(0, queryIndex) || pathname;
  const existingQuery = queryIndex === -1 ? "" : pathname.slice(queryIndex + 1);
  const params = new URLSearchParams(existingQuery);
  const studyRunId = input.studyRunId?.trim();
  if (studyRunId) {
    params.set("studyRunId", studyRunId);
  }
  const intakeRunId = input.intakeRunId?.trim();
  if (intakeRunId) {
    params.set("intakeRunId", intakeRunId);
  }
  if (input.audience) {
    params.set("audience", input.audience);
  }
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function buildCaseWorkspaceHomeHref(input: CaseWorkspaceNavInput): string {
  const path = `/hives/${encodeURIComponent(input.caseId)}/ready`;
  return appendWorkspaceQueryParams(path, input);
}

export function buildCaseDocumentsHref(input: CaseWorkspaceNavInput): string {
  const intakeRunId = input.intakeRunId?.trim();
  if (intakeRunId) {
    const path = `/intake/${encodeURIComponent(intakeRunId)}`;
    return appendWorkspaceQueryParams(path, input);
  }
  const studyRunId = input.studyRunId?.trim();
  if (studyRunId) {
    return buildHiveReadyHref({ caseId: input.caseId, studyRunId });
  }
  return buildCaseWorkspaceHomeHref(input);
}

export function buildCaseCanonicalStudyHref(input: CaseWorkspaceNavInput): string {
  const studyRunId = input.studyRunId?.trim() ?? "";
  const path = buildHiveCanonicalJsonHref({ caseId: input.caseId, studyRunId });
  return appendWorkspaceQueryParams(path, input);
}

export function buildCaseReportsHref(input: CaseWorkspaceNavInput): string {
  const studyRunId = input.studyRunId?.trim() ?? "";
  const path = buildHiveReportPreviewHref({
    caseId: input.caseId,
    studyRunId,
    audience: input.audience ?? "customer",
  });
  return appendWorkspaceQueryParams(path, input);
}

export function resolveCaseWorkspaceSectionFromPathname(pathname: string): CaseWorkspaceSection | null {
  if (/^\/intake\/[^/]+\/?$/.test(pathname)) {
    return "documents";
  }
  if (/\/hives\/[^/]+\/building\/?$/.test(pathname)) {
    return "documents";
  }
  if (/\/hives\/[^/]+\/ready\/?$/.test(pathname)) {
    return "documents";
  }
  if (/\/hives\/[^/]+\/canonical-json\/?$/.test(pathname)) {
    return "canonical-study";
  }
  if (/\/hives\/[^/]+\/report-preview\/?$/.test(pathname)) {
    return "reports";
  }
  return null;
}

export function caseWorkspaceSectionLabel(section: CaseWorkspaceSection): string {
  switch (section) {
    case "case":
      return "Case";
    case "documents":
      return "Documents";
    case "canonical-study":
      return "Canonical Study";
    case "reports":
      return "Reports";
  }
}

export function isCaseWorkspaceSectionNavEnabled(
  section: Exclude<CaseWorkspaceSection, "case">,
  input: CaseWorkspaceNavInput,
): boolean {
  const studyRunId = input.studyRunId?.trim();
  const intakeRunId = input.intakeRunId?.trim();
  if (section === "documents") {
    return Boolean(intakeRunId || studyRunId);
  }
  return Boolean(studyRunId);
}
