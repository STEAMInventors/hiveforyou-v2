export type DiscoverQuestionAnswerKind = "single_choice" | "multi_select" | "free_text";

export type DiscoverQuestionOption = {
  id: string;
  label: string;
};

export type DiscoverQuestion = {
  id: string;
  questionKey: string;
  prompt: string;
  humanReason: string;
  answerKind: DiscoverQuestionAnswerKind;
  options: DiscoverQuestionOption[];
  ambiguityKey: string;
  relatedLogicalDocumentIds: string[];
  required: true;
};
