import { INTAKE_PROCESSING_STAGE_LABELS } from "@hiveforyou/shared/intake";

import { PROCESSING_STAGE_LABELS } from "@/lib/document-discovery/processing-stages";

export type HiveBuildingPhase = "intake" | "study" | "discover";

export const STUDY_HIVE_STAGE_LABELS = [
  "Reading your documents together",
  "Connecting facts across files",
  "Linking every claim to its page",
  "Checking what's missing",
] as const;

/** Primary heading while work is in progress (all transition modals). */
export const HIVE_PROCESSING_TITLE = "Hiving";

export const HIVE_BUILDING_COPY: Record<
  HiveBuildingPhase,
  {
    buildingTitle: string;
    buildingSubtitle: string;
    readyTitle: string;
    readySubtitle: string;
  }
> = {
  intake: {
    buildingTitle: HIVE_PROCESSING_TITLE,
    buildingSubtitle: "Usually takes about three minutes. You can keep adding files.",
    readyTitle: "Your hive is ready",
    readySubtitle: "Every finding links to the file and page it came from.",
  },
  study: {
    buildingTitle: HIVE_PROCESSING_TITLE,
    buildingSubtitle: "Usually takes a few minutes. Every finding will link to its page.",
    readyTitle: "Your hive is ready",
    readySubtitle: "Every finding links to the file and page it came from.",
  },
  discover: {
    buildingTitle: HIVE_PROCESSING_TITLE,
    buildingSubtitle: "Organizing your documents for what comes next.",
    readyTitle: "Your hive is ready",
    readySubtitle: "Your documents are organized and ready for the next step.",
  },
};

export function hiveBuildingStepLabels(phase: HiveBuildingPhase): readonly string[] {
  switch (phase) {
    case "intake":
      return INTAKE_PROCESSING_STAGE_LABELS;
    case "study":
      return STUDY_HIVE_STAGE_LABELS;
    case "discover":
      return PROCESSING_STAGE_LABELS;
    default:
      return INTAKE_PROCESSING_STAGE_LABELS;
  }
}
