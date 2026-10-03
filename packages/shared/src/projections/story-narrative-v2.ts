import type { Chip } from "./case-view";

export const STORY_NARRATIVE_V2_SCHEMA = "story/2" as const;

export type MeasureDirection = "higher_is_better" | "lower_is_better";

export type StoryMovementId =
  | "orientation"
  | "going_well"
  | "closer_look"
  | "would_help"
  | "next_step";

export type StoryNarrativeSlotType =
  | "orientation_plan"
  | "orientation_dates"
  | "echo"
  | "progress"
  | "steady"
  | "progress_short_of_target"
  | "worth_a_question"
  | "changed"
  | "conflict"
  | "missing_document"
  | "next_add_files"
  | "next_meeting_prep";

export type ProgressShortOfTargetPayload = {
  baseline: number;
  latest: number;
  target: number;
  unit: string;
};

export interface StoryNarrativeSlot {
  slotId: string;
  slotType: StoryNarrativeSlotType;
  itemIds: string[];
  cardId?: string | null;
  text: string;
  fallbackUsed: boolean;
  chips: Chip[];
  progressShortOfTarget?: ProgressShortOfTargetPayload | null;
  questionRequest?: string | null;
  documentType?: string | null;
}

export interface StoryMovement {
  movementId: StoryMovementId;
  slots: StoryNarrativeSlot[];
}

export interface StoryNarrativeV2 {
  schemaVersion: typeof STORY_NARRATIVE_V2_SCHEMA;
  movements: StoryMovement[];
}
