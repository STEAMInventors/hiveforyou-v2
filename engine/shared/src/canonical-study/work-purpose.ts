import type { QuestionsAnswerSnapshot } from "../questions";

/** Key on `QuestionsAnswerSnapshot.userContext` for composer / workspace purpose text. */
export const STATED_WORK_PURPOSE_CONTEXT_KEY = "statedWorkPurpose" as const;

export const STATED_WORK_PURPOSE_SOURCE_INTAKE = "intake_composer" as const;

export function buildIntakeStudyUserContext(
  rawIntent: string | null | undefined,
): Record<string, unknown> | null {
  const text = rawIntent?.trim();
  if (!text) {
    return null;
  }
  return {
    [STATED_WORK_PURPOSE_CONTEXT_KEY]: text,
    capturedFrom: STATED_WORK_PURPOSE_SOURCE_INTAKE,
  };
}

export function readStatedWorkPurpose(
  userContext: QuestionsAnswerSnapshot["userContext"],
): string | null {
  if (!userContext || typeof userContext !== "object") {
    return null;
  }
  const value = userContext[STATED_WORK_PURPOSE_CONTEXT_KEY];
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
