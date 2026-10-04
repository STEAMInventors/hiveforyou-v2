import type { StartCanonicalStudyRequest } from "@hiveforyou/shared/canonical-study";
import type { StudyRunErrorCode } from "@hiveforyou/shared/canonical-study";

export type ReadinessFailure = {
  ok: false;
  errorCode: StudyRunErrorCode;
  message: string;
};

export type ReadinessSuccess = { ok: true };

export type ReadinessResult = ReadinessSuccess | ReadinessFailure;

function isAnswerComplete(
  question: StartCanonicalStudyRequest["questionSet"]["questions"][number],
  value: Record<string, unknown> | undefined,
): boolean {
  if (!value) {
    return false;
  }
  switch (question.answerKind) {
    case "missing_document_disposition": {
      const disposition = value.disposition as string | undefined;
      if (disposition === "add_document") {
        return Boolean(value.stagedDocumentId && value.filename);
      }
      return disposition === "unavailable" || disposition === "not_applicable";
    }
    case "single_choice":
      return Boolean(value.choiceId);
    case "context_change": {
      if (value.changed === false) {
        return true;
      }
      return typeof value.description === "string" && value.description.trim().length > 0;
    }
    case "multi_select": {
      const choiceIds = value.choiceIds as string[] | undefined;
      if (!choiceIds?.length) {
        return false;
      }
      if (choiceIds.includes("something_else")) {
        return Boolean(
          typeof value.otherText === "string" && value.otherText.trim().length > 0,
        );
      }
      return true;
    }
    case "free_text":
      return true;
    default:
      return false;
  }
}

export function validateStudyReadiness(
  request: StartCanonicalStudyRequest,
): ReadinessResult {
  if (!request.sourceDocuments.length) {
    return {
      ok: false,
      errorCode: "MISSING_STAGED_DOCUMENTS",
      message: "At least one staged document is required.",
    };
  }

  const required = request.questionSet.questions.filter((q) => q.required);
  for (const question of required) {
    const record = request.answerSnapshot.answers[question.id];
    if (!record || !isAnswerComplete(question, record.value)) {
      return {
        ok: false,
        errorCode: "INCOMPLETE_REQUIRED_QUESTIONS",
        message: `Required question not complete: ${question.id}`,
      };
    }
  }

  return { ok: true };
}
