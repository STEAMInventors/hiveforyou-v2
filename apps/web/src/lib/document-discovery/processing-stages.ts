export const PROCESSING_STAGE_LABELS = [
  "Files received",
  "Understanding documents",
  "Connecting the case",
  "Checking completeness",
] as const;

export type ProcessingStageLabel = (typeof PROCESSING_STAGE_LABELS)[number];

export const PROCESSING_STAGE_COUNT = PROCESSING_STAGE_LABELS.length;
