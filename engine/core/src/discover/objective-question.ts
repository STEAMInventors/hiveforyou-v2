import { randomUUID } from "node:crypto";



import type { DiscoverQuestion } from "@hiveforyou/shared/discover";

import type { ProposedSuggestedObjective } from "@hiveforyou/shared/discover";



export const DISCOVERY_OBJECTIVE_QUESTION_KEY = "discovery.objective";



const SOMETHING_ELSE_OPTION_ID = "objective.something_else";



export function objectiveQuestionKeyForDomain(domainId: string): string {
  return `${DISCOVERY_OBJECTIVE_QUESTION_KEY}.${domainId}`;
}

export function domainIdFromObjectiveQuestion(question: DiscoverQuestion): string | null {
  const prefix = `${DISCOVERY_OBJECTIVE_QUESTION_KEY}.`;
  if (question.questionKey.startsWith(prefix)) {
    const domainId = question.questionKey.slice(prefix.length).trim();
    return domainId.length > 0 ? domainId : null;
  }
  return null;
}

export function createObjectiveQuestion(input: {

  domainId: string;

  questionId?: string;

  suggestedObjectives?: ProposedSuggestedObjective[];

}): DiscoverQuestion {

  const suggestions = input?.suggestedObjectives ?? [];

  const options = [

    ...suggestions.map((item) => ({ id: item.id, label: item.label })),

    { id: SOMETHING_ELSE_OPTION_ID, label: "Something else" },

  ];

  return {

    id: input?.questionId ?? randomUUID(),

    questionKey: objectiveQuestionKeyForDomain(input.domainId),

    prompt: "What would you like Hive to help you accomplish?",

    humanReason:

      "Your choice guides what Hive emphasizes during discovery. It does not change what the documents say.",

    answerKind: options.length > 1 ? "single_choice" : "free_text",

    options,

    ambiguityKey: "objective",

    relatedLogicalDocumentIds: [],

    required: true,

  };

}



export function isObjectiveQuestion(question: DiscoverQuestion): boolean {

  return (
    question.questionKey === DISCOVERY_OBJECTIVE_QUESTION_KEY ||
    question.questionKey.startsWith(`${DISCOVERY_OBJECTIVE_QUESTION_KEY}.`)
  );

}



function readOneObjectiveAnswer(
  question: DiscoverQuestion,
  answers: { questionId: string; answer: Record<string, unknown> }[],
): string | null {
  const answer = answers.find((item) => item.questionId === question.id);
  if (!answer) {
    return null;
  }
  const text = answer.answer.text;
  if (typeof text === "string" && text.trim().length > 0) {
    return text.trim();
  }
  const choiceId = answer.answer.choiceId;
  if (typeof choiceId === "string") {
    if (choiceId === SOMETHING_ELSE_OPTION_ID) {
      const custom = answer.answer.customText;
      return typeof custom === "string" && custom.trim().length > 0 ? custom.trim() : null;
    }
    const option = question.options.find((item) => item.id === choiceId);
    return option?.label ?? null;
  }
  return null;
}

export function readObjectiveTextFromAnswers(

  questions: DiscoverQuestion[],

  answers: { questionId: string; answer: Record<string, unknown> }[],

): string | null {

  const lines = questions.filter(isObjectiveQuestion).flatMap((question) => {
    const text = readOneObjectiveAnswer(question, answers);
    if (!text) {
      return [];
    }
    const domainId = domainIdFromObjectiveQuestion(question);
    return [domainId ? `${domainId}: ${text}` : text];
  });

  return lines.length > 0 ? lines.join("\n") : null;

}

