import type { StudyProcessingMode, StudyRunStatus } from "@hiveforyou/shared/canonical-study";
import { isStudyRunProcessing } from "@hiveforyou/shared/canonical-study";
import type { IntakeStudyPath } from "@hiveforyou/shared/intake";

import type { CaseMapViewBundle } from "@/lib/case-map/case-map-view-bundle";

export type StudyPresentationSignals = Pick<
  CaseMapViewBundle,
  "status" | "processingMode" | "caseMap" | "projectionsPending"
>;

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
  return `/study/${encodeURIComponent(input.studyRunId)}/map`;
}

/** Terminal study status that may still lack persisted case-map projections. */
export function isCanonicalStudyPresentationReady(status: StudyRunStatus): boolean {
  return status === "SUCCEEDED" || status === "NEEDS_REVIEW";
}

export function isPackDrivenStudyAwaitingRawExtraction(status: StudyRunStatus): boolean {
  return isStudyRunProcessing(status);
}

/** Pack-driven raw extraction finished successfully; no case-map presentation exists yet. */
export function isRawExtractionSucceeded(signals: StudyPresentationSignals): boolean {
  return (
    signals.processingMode === "pack_driven_v1" &&
    signals.status === "SUCCEEDED" &&
    signals.caseMap == null
  );
}

/** Canonical study finished and case-map projections are available for presentation. */
export function isCanonicalPresentationReady(signals: StudyPresentationSignals): boolean {
  if (signals.status !== "SUCCEEDED" && signals.status !== "NEEDS_REVIEW") {
    return false;
  }
  if (signals.projectionsPending) {
    return false;
  }
  return signals.caseMap != null;
}

export function isStudyWorkspaceCompletionReady(signals: StudyPresentationSignals): boolean {
  return isCanonicalPresentationReady(signals) || isRawExtractionSucceeded(signals);
}

export function isStudyBuildPollingActive(signals: StudyPresentationSignals): boolean {
  if (isRawExtractionSucceeded(signals)) {
    return false;
  }
  return isStudyRunProcessing(signals.status) || !!signals.projectionsPending;
}
