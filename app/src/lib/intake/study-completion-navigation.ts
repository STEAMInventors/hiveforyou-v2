import type { StudyProcessingMode, StudyRunStatus } from "@hiveforyou/shared/canonical-study";
import { isStudyRunProcessing } from "@hiveforyou/shared/canonical-study";
import type { IntakeStudyPath } from "@hiveforyou/shared/intake";

export function resolveStudyProcessingModeFromStudyPath(
  studyPath: IntakeStudyPath | undefined,
): StudyProcessingMode {
  return studyPath === "DOMAIN_PACK" ? "pack_driven_v1" : "canonical_openai_v4";
}

export function buildPostStudyCompletionHref(input: {
  processingMode: StudyProcessingMode;
  caseId: string;
  studyRunId: string;
}): string {
  if (input.processingMode === "pack_driven_v1") {
    return `/hives/${encodeURIComponent(input.caseId)}/extraction-debug?studyRunId=${encodeURIComponent(input.studyRunId)}`;
  }
  return `/study/${encodeURIComponent(input.studyRunId)}/map`;
}

export function isCanonicalStudyPresentationReady(status: StudyRunStatus): boolean {
  return status === "SUCCEEDED" || status === "NEEDS_REVIEW";
}

export function isPackDrivenStudyAwaitingRawExtraction(status: StudyRunStatus): boolean {
  return isStudyRunProcessing(status);
}
