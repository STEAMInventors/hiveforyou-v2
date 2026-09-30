import type {
  ContextChangeAnswerValue,
  MultiSelectAnswerValue,
  QuestionAnswerRecord,
  QuestionAnswerValue,
  QuestionDefinition,
  MissingDocumentAnswerValue,
} from "./types";

function isMissingDocumentAnswerComplete(
  value: MissingDocumentAnswerValue,
): boolean {
  if (value.disposition === "add_document") {
    return Boolean(value.stagedDocumentId && value.filename);
  }
  return true;
}

function isAnswerComplete(
  question: QuestionDefinition,
  value: QuestionAnswerValue | undefined,
): boolean {
  if (!value) {
    return false;
  }

  switch (question.answerKind) {
    case "missing_document_disposition":
      return isMissingDocumentAnswerComplete(value as MissingDocumentAnswerValue);
    case "single_choice":
      return Boolean((value as { choiceId?: string }).choiceId);
    case "context_change": {
      const ctx = value as ContextChangeAnswerValue;
      if (!ctx.changed) {
        return true;
      }
      return ctx.description.trim().length > 0;
    }
    case "multi_select": {
      const multi = value as MultiSelectAnswerValue;
      if (!multi.choiceIds.length) {
        return false;
      }
      if (multi.choiceIds.includes("something_else")) {
        return Boolean(multi.otherText?.trim());
      }
      return true;
    }
    case "free_text":
      return true;
    default:
      return false;
  }
}

export function countRequiredProgress(
  questions: QuestionDefinition[],
  answers: Record<string, QuestionAnswerRecord>,
): { requiredTotal: number; requiredAnswered: number; canStudy: boolean } {
  const required = questions.filter((q) => q.required);
  const requiredTotal = required.length;
  let requiredAnswered = 0;

  for (const question of required) {
    const record = answers[question.id];
    if (record && isAnswerComplete(question, record.value)) {
      requiredAnswered += 1;
    }
  }

  return {
    requiredTotal,
    requiredAnswered,
    canStudy: requiredTotal > 0 && requiredAnswered === requiredTotal,
  };
}

export function isQuestionAnswered(
  question: QuestionDefinition,
  answers: Record<string, QuestionAnswerRecord>,
): boolean {
  const record = answers[question.id];
  return Boolean(record && isAnswerComplete(question, record.value));
}
