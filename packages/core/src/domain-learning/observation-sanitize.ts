import type { QuestionAnswerKind } from "@hiveforyou/shared/questions";

/** Bounded metadata safe for domain_learning_observations — never raw free text. */
export function sanitizeAnswerForObservation(
  answerKind: QuestionAnswerKind,
  value: Record<string, unknown>,
): Record<string, unknown> {
  switch (answerKind) {
    case "missing_document_disposition": {
      const disposition = value.disposition;
      if (disposition === "add_document") {
        return { disposition: "add_document", hasFilename: Boolean(value.filename) };
      }
      return { disposition: String(disposition ?? "unknown") };
    }
    case "single_choice":
      return { choiceId: value.choiceId ?? null };
    case "context_change":
      return { changed: Boolean(value.changed) };
    case "multi_select":
      return {
        choiceIds: Array.isArray(value.choiceIds) ? value.choiceIds : [],
        hasOtherText: Boolean(value.otherText),
      };
    case "free_text":
      return { provided: true, textLength: String(value.text ?? "").length };
    default:
      return { kind: answerKind };
  }
}

export function extractDispositionFromAnswer(
  answerKind: QuestionAnswerKind,
  value: Record<string, unknown>,
): string | null {
  if (answerKind === "missing_document_disposition" && value.disposition) {
    return String(value.disposition);
  }
  return null;
}
