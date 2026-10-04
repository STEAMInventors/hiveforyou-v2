/** Question set + answer contracts for V2-001D (Engine 1 boundary — no Engine 2 findings). */

import type { QuestionTriggerType } from "@hiveforyou/shared/domain-learning";

export type QuestionType =
  | "MISSING_FACT"
  | "CONFLICT"
  | "IDENTITY"
  | "INTERPRETATION"
  | "CASE_CONTEXT"
  | "ANALYSIS_INTENT"
  | "PROFESSIONAL_DECISION";

export type QuestionGroupId =
  | "complete_picture"
  | "understand_situation"
  | "what_matters";

export const QUESTION_GROUP_LABELS: Record<QuestionGroupId, string> = {
  complete_picture: "Complete the picture",
  understand_situation: "Help Hive understand your situation",
  what_matters: "Tell Hive what matters to you",
};

export type QuestionAnswerKind =
  | "missing_document_disposition"
  | "single_choice"
  | "context_change"
  | "multi_select"
  | "free_text";

export type MapNodeResolutionState =
  | "EXPECTED"
  | "PROVIDED"
  | "UNAVAILABLE"
  | "NOT_APPLICABLE"
  | "AMBIGUOUS"
  | "RESOLVED";

export type QuestionOption = {
  id: string;
  label: string;
};

export type QuestionTriggerRef = {
  kind: "missing_node" | "document" | "document_pair" | "sequence" | "intent";
  id: string;
};

export type QuestionDefinition = {
  id: string;
  type: QuestionType;
  groupId: QuestionGroupId;
  /** Short human label above prompt — not an internal enum */
  kicker?: string;
  prompt: string;
  humanReason: string;
  required: boolean;
  answerKind: QuestionAnswerKind;
  options?: QuestionOption[];
  relatedDocumentIds?: string[];
  relatedUnresolvedNodeIds?: string[];
  missingDocumentId?: string;
  ambiguityPairKey?: string;
  affectsCanonicalTruth: boolean;
  affectsAnalysis: boolean;
  affectsProjection: boolean;
  triggerRefs?: QuestionTriggerRef[];
  questionKey?: string;
  wordingVersion?: string;
  triggerType?: QuestionTriggerType;
  triggerKey?: string | null;
  triggerMetadata?: Record<string, unknown>;
};

export type MissingDocumentAnswerValue =
  | {
      disposition: "add_document";
      stagedDocumentId: string;
      filename: string;
      sizeBytes: number;
    }
  | { disposition: "unavailable" }
  | { disposition: "not_applicable" };

export type SingleChoiceAnswerValue = {
  choiceId: string;
};

export type ContextChangeAnswerValue =
  | { changed: false }
  | { changed: true; description: string };

export type MultiSelectAnswerValue = {
  choiceIds: string[];
  otherText?: string;
};

export type FreeTextAnswerValue = {
  text: string;
};

export type QuestionAnswerValue =
  | MissingDocumentAnswerValue
  | SingleChoiceAnswerValue
  | ContextChangeAnswerValue
  | MultiSelectAnswerValue
  | FreeTextAnswerValue;

export type QuestionAnswerRecord = {
  questionId: string;
  value: QuestionAnswerValue;
  status: "answered";
  updatedAt: string;
};

/** Persistable snapshot shape for future backend versioning */
export type QuestionsAnswerSnapshot = {
  questionSetId: string;
  answers: Record<string, QuestionAnswerRecord>;
  missingNodeStates: Record<string, MapNodeResolutionState>;
  ambiguityNodeStates: Record<string, MapNodeResolutionState>;
  analysisIntent: MultiSelectAnswerValue | null;
  userContext: FreeTextAnswerValue | null;
};

export type QuestionSet = {
  id: string;
  questions: QuestionDefinition[];
};
