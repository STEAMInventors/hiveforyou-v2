/** Versioned question + answer snapshot (shared contract). */

import type { QuestionTriggerType } from "./domain-learning";

export type MapNodeResolutionState =
  | "EXPECTED"
  | "PROVIDED"
  | "UNAVAILABLE"
  | "NOT_APPLICABLE"
  | "AMBIGUOUS"
  | "RESOLVED";

export type QuestionAnswerKind =
  | "missing_document_disposition"
  | "single_choice"
  | "context_change"
  | "multi_select"
  | "free_text";

export type QuestionDefinition = {
  id: string;
  prompt: string;
  required: boolean;
  answerKind: QuestionAnswerKind;
  affectsCanonicalTruth: boolean;
  affectsAnalysis: boolean;
  affectsProjection: boolean;
  /** Stable semantic identity — independent of displayed wording. */
  questionKey?: string;
  questionType?: string;
  wordingVersion?: string;
  triggerType?: QuestionTriggerType;
  triggerKey?: string | null;
  triggerMetadata?: Record<string, unknown>;
};

export type QuestionAnswerValue = Record<string, unknown>;

export type QuestionAnswerRecord = {
  questionId: string;
  value: QuestionAnswerValue;
  status: "answered";
  updatedAt: string;
};

export type QuestionsAnswerSnapshot = {
  questionSetId: string;
  answers: Record<string, QuestionAnswerRecord>;
  missingNodeStates: Record<string, MapNodeResolutionState>;
  ambiguityNodeStates: Record<string, MapNodeResolutionState>;
  analysisIntent: Record<string, unknown> | null;
  userContext: Record<string, unknown> | null;
};

export type QuestionSetSnapshot = {
  id: string;
  questions: QuestionDefinition[];
};
