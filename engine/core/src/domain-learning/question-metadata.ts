import type { QuestionTriggerType } from "@hiveforyou/shared/domain-learning";
import type { QuestionDefinition } from "@hiveforyou/shared/questions";

export function resolveQuestionKey(question: QuestionDefinition): string {
  if (question.questionKey) {
    return question.questionKey;
  }
  switch (question.answerKind) {
    case "missing_document_disposition":
      return "missing_expected_document";
    case "single_choice":
      return "ambiguous_document_identity";
    case "context_change":
      return "missing_context";
    case "multi_select":
      return "analysis_intent";
    case "free_text":
      return "optional_user_context";
    default:
      return question.id;
  }
}

export function resolveQuestionType(question: QuestionDefinition): string {
  if (question.questionType) {
    return question.questionType;
  }
  switch (question.answerKind) {
    case "missing_document_disposition":
      return "MISSING_FACT";
    case "single_choice":
      return "IDENTITY";
    case "context_change":
      return "CASE_CONTEXT";
    case "multi_select":
      return "ANALYSIS_INTENT";
    case "free_text":
      return "CASE_CONTEXT";
    default:
      return "OTHER";
  }
}

export function resolveTriggerType(question: QuestionDefinition): QuestionTriggerType {
  if (question.triggerType) {
    return question.triggerType;
  }
  switch (question.answerKind) {
    case "missing_document_disposition":
      return "MISSING_EXPECTED_DOCUMENT";
    case "single_choice":
      return "AMBIGUOUS_DOCUMENT_IDENTITY";
    case "context_change":
      return "MISSING_CONTEXT";
    case "multi_select":
      return "ANALYSIS_INTENT";
    default:
      return "OTHER";
  }
}

export function resolveTriggerKey(question: QuestionDefinition): string | null {
  if (question.triggerKey !== undefined) {
    return question.triggerKey;
  }
  const meta = question.triggerMetadata ?? {};
  if (typeof meta.subjectKey === "string") {
    return meta.subjectKey;
  }
  return question.id;
}

export function buildTriggerMetadata(
  question: QuestionDefinition,
): Record<string, unknown> {
  return {
    clientQuestionId: question.id,
    answerKind: question.answerKind,
    ...(question.triggerMetadata ?? {}),
  };
}
