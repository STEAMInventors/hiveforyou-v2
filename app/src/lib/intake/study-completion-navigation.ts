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
