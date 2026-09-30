"use client";

import type {
  FreeTextAnswerValue,
  QuestionDefinition,
} from "@/lib/questions/types";

import { QuestionCard } from "./QuestionCard";
import { QuestionReason } from "./QuestionReason";

type OptionalContextQuestionProps = {
  question: QuestionDefinition;
  value: FreeTextAnswerValue | undefined;
  onChange: (value: FreeTextAnswerValue) => void;
};

export function OptionalContextQuestion({
  question,
  value,
  onChange,
}: OptionalContextQuestionProps) {
  return (
    <QuestionCard
      questionId={question.id}
      prompt={`${question.prompt} (Optional)`}
      reason={<QuestionReason reason={question.humanReason} />}
      answered={Boolean(value?.text.trim())}
    >
      <input
        type="text"
        data-testid="optional-context-input"
        className="w-full rounded-hive-xl border border-hive-border bg-hive-page/60 px-4 py-3.5 font-sans text-sm text-hive-navy focus:bg-hive-surface focus:outline-none focus:ring-2 focus:ring-hive-sage"
        placeholder="Share anything else that might help…"
        value={value?.text ?? ""}
        onChange={(event) => onChange({ text: event.target.value })}
      />
    </QuestionCard>
  );
}
