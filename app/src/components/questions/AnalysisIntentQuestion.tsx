"use client";

import type {
  MultiSelectAnswerValue,
  QuestionDefinition,
} from "@/lib/questions/types";

import { QuestionCard } from "./QuestionCard";
import { QuestionReason } from "./QuestionReason";

type AnalysisIntentQuestionProps = {
  question: QuestionDefinition;
  value: MultiSelectAnswerValue | undefined;
  onChange: (value: MultiSelectAnswerValue) => void;
};

export function AnalysisIntentQuestion({
  question,
  value,
  onChange,
}: AnalysisIntentQuestionProps) {
  const selected = new Set(value?.choiceIds ?? []);
  const showOther = selected.has("something_else");
  const answered = (value?.choiceIds.length ?? 0) > 0;

  const toggle = (choiceId: string) => {
    const next = new Set(selected);
    if (next.has(choiceId)) {
      next.delete(choiceId);
    } else {
      next.add(choiceId);
    }
    onChange({
      choiceIds: [...next],
      otherText: next.has("something_else") ? value?.otherText : undefined,
    });
  };

  return (
    <QuestionCard
      questionId={question.id}
      kicker={question.kicker}
      prompt={question.prompt}
      reason={<QuestionReason reason={question.humanReason} />}
      answered={answered}
    >
      <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        role="group"
        aria-label="Analysis priorities"
      >
        {question.options?.map((option) => {
          const active = selected.has(option.id);
          return (
            <button
              key={option.id}
              type="button"
              data-testid={`intent-option-${option.id}`}
              aria-pressed={active}
              onClick={() => toggle(option.id)}
              className={[
                "flex items-start gap-3 rounded-hive-xl p-4 text-left transition-colors",
                active
                  ? "bg-hive-soft-sky/60 shadow-hive"
                  : "bg-hive-page/60 hover:bg-hive-page",
              ].join(" ")}
            >
              <span
                className={[
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                  active
                    ? "border-hive-sage bg-hive-sage text-hive-text-inverse"
                    : "border-hive-border bg-hive-surface",
                ].join(" ")}
                aria-hidden
              >
                {active ? "✓" : ""}
              </span>
              <span className="font-sans text-sm font-semibold text-hive-navy">
                {option.label}
              </span>
            </button>
          );
        })}
      </div>

      {showOther && (
        <div className="mt-4">
          <label
            htmlFor={`intent-other-${question.id}`}
            className="mb-2 block font-sans text-xs font-semibold text-hive-text-muted"
          >
            Something else
          </label>
          <input
            id={`intent-other-${question.id}`}
            data-testid="intent-other-text"
            type="text"
            className="w-full rounded-hive-xl border border-hive-border bg-hive-surface px-4 py-3 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-hive-sage"
            placeholder="Tell Hive what you want to understand…"
            value={value?.otherText ?? ""}
            onChange={(event) =>
              onChange({
                choiceIds: value?.choiceIds ?? ["something_else"],
                otherText: event.target.value,
              })
            }
          />
        </div>
      )}
    </QuestionCard>
  );
}
