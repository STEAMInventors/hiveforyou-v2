"use client";

import type { DocumentDiscoveryDocument } from "@/lib/document-discovery/types";
import type {
  QuestionDefinition,
  SingleChoiceAnswerValue,
} from "@/lib/questions/types";

import { QuestionCard } from "./QuestionCard";
import { QuestionDocumentReference } from "./QuestionDocumentReference";
import { QuestionReason } from "./QuestionReason";

type DocumentAmbiguityQuestionProps = {
  question: QuestionDefinition;
  relatedDocuments: DocumentDiscoveryDocument[];
  value: SingleChoiceAnswerValue | undefined;
  onSelect: (choiceId: string) => void;
};

export function DocumentAmbiguityQuestion({
  question,
  relatedDocuments,
  value,
  onSelect,
}: DocumentAmbiguityQuestionProps) {
  const answered = Boolean(value?.choiceId);

  return (
    <QuestionCard
      questionId={question.id}
      kicker={question.kicker}
      prompt={question.prompt}
      reason={<QuestionReason reason={question.humanReason} />}
      answered={answered}
    >
      <div className="mb-6">
        <QuestionDocumentReference documents={relatedDocuments} />
      </div>
      <div className="flex flex-wrap gap-3" role="group" aria-label="Ambiguity answer">
        {question.options?.map((option) => {
          const selected = value?.choiceId === option.id;
          return (
            <button
              key={option.id}
              type="button"
              data-testid={`ambiguity-option-${option.id}`}
              aria-pressed={selected}
              onClick={() => onSelect(option.id)}
              className={[
                "rounded-hive-xl px-4 py-2.5 font-sans text-sm font-semibold transition-colors",
                selected
                  ? "bg-hive-navy text-hive-text-inverse shadow-hive-md"
                  : "bg-hive-page text-hive-navy hover:bg-hive-soft-sky/50",
              ].join(" ")}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </QuestionCard>
  );
}
