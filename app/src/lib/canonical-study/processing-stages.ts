import type { StudyOrchestrationStage } from "@hiveforyou/core";

export const STUDY_STAGE_LABELS: Record<StudyOrchestrationStage, string> = {
  preparing: "Preparing your case",
  studying: "Studying the documents together",
  checking: "Checking the connections",
  validating: "Validating what can be supported",
  saving: "Saving your case understanding",
  complete: "Complete",
};

export const STUDY_STAGE_ORDER: StudyOrchestrationStage[] = [
  "preparing",
  "studying",
  "checking",
  "validating",
  "saving",
];
