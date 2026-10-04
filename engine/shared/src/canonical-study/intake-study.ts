import type { QuestionSetSnapshot, QuestionsAnswerSnapshot } from "../questions";

/** Empty Q&A for Intake-origin study (no Discover questions milestone). */
export const INTAKE_STUDY_QUESTION_SET_ID = "intake-study-empty/1" as const;

export const INTAKE_STUDY_QUESTION_SET: QuestionSetSnapshot = {
  id: INTAKE_STUDY_QUESTION_SET_ID,
  questions: [],
};

export const INTAKE_STUDY_ANSWER_SNAPSHOT: QuestionsAnswerSnapshot = {
  questionSetId: INTAKE_STUDY_QUESTION_SET_ID,
  answers: {},
  missingNodeStates: {},
  ambiguityNodeStates: {},
  analysisIntent: null,
  userContext: null,
};
