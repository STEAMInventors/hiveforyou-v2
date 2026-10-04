import type { IntakeDocumentStatus, IntakeRunStatus } from "./document-identity";

export const INTAKE_PROCESSING_STAGE_LABELS = [
  "Reading your documents",
  "Sorting by type and date",
  "Linking every claim to its page",
  "Checking what's missing",
] as const;

export type IntakeProcessingStageLabel = (typeof INTAKE_PROCESSING_STAGE_LABELS)[number];

function maxDocumentStage(statuses: IntakeDocumentStatus[]): number {
  if (statuses.length === 0) {
    return 0;
  }
  let max = 0;
  for (const status of statuses) {
    switch (status) {
      case "UPLOADED":
      case "EXTRACTING":
        max = Math.max(max, 0);
        break;
      case "CLASSIFYING":
      case "NEEDS_OCR":
        max = Math.max(max, 1);
        break;
      case "CLASSIFIED":
      case "NEEDS_REVIEW":
      case "FAILED":
        max = Math.max(max, 2);
        break;
      default: {
        const _unreachable: never = status;
        max = Math.max(max, 0);
      }
    }
  }
  return max;
}

/** Maps run + document progress to a purposeful processing stage index (0–3). */
export function intakeProcessingStageIndex(input: {
  runStatus: IntakeRunStatus;
  documentStatuses: IntakeDocumentStatus[];
  workspaceReady: boolean;
}): number {
  if (input.workspaceReady) {
    return INTAKE_PROCESSING_STAGE_LABELS.length - 1;
  }
  if (input.runStatus !== "RUNNING") {
    return INTAKE_PROCESSING_STAGE_LABELS.length - 1;
  }
  const docStage = maxDocumentStage(input.documentStatuses);
  if (docStage >= 2) {
    return 2;
  }
  if (docStage >= 1) {
    return 1;
  }
  return 0;
}

export function intakeProcessingStageLabel(input: {
  runStatus: IntakeRunStatus;
  documentStatuses: IntakeDocumentStatus[];
  workspaceReady: boolean;
}): IntakeProcessingStageLabel {
  const index = intakeProcessingStageIndex(input);
  return INTAKE_PROCESSING_STAGE_LABELS[index] ?? INTAKE_PROCESSING_STAGE_LABELS[0];
}
