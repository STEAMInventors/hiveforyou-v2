"use client";

import type {
  ContextChangeAnswerValue,
  QuestionDefinition,
} from "@/lib/questions/types";

import { QuestionCard } from "./QuestionCard";
import { QuestionReason } from "./QuestionReason";

type ContextQuestionProps = {
  question: QuestionDefinition;
  value: ContextChangeAnswerValue | undefined;
  onChange: (value: ContextChangeAnswerValue) => void;
};

export function ContextQuestion({
  question,
  value,
  onChange,
}: ContextQuestionProps) {
  const changed = value?.changed === true;
  const answered =
    value?.changed === false ||
    (value?.changed === true && value.description.trim().length > 0);

  return (
    <QuestionCard
      questionId={question.id}
      kicker={question.kicker}
      prompt={question.prompt}
      reason={<QuestionReason reason={question.humanReason} />}
      answered={answered}
    >
      <fieldset className="space-y-3">
        <legend className="sr-only">Changes since documents were created</legend>
        {question.options?.map((option) => {
          const isChangedOption = option.id === "changed";
          const checked = isChangedOption ? changed : value?.changed === false;
          return (
            <label
              key={option.id}
              className={[
                "flex cursor-pointer items-start gap-3 rounded-hive-xl p-3.5 transition-colors",
                checked ? "bg-hive-soft-sky/40" : "bg-hive-page/60 hover:bg-hive-page",
              ].join(" ")}
            >
              <input
                type="radio"
                name={`context-${question.id}`}
                className="mt-1 h-4 w-4 accent-hive-sage"
                checked={checked}
                onChange={() => {
                  if (isChangedOption) {
                    onChange({ changed: true, description: value?.changed ? value.description : "" });
                  } else {
                    onChange({ changed: false });
                  }
                }}
              />
              <span className="font-sans text-sm font-medium text-hive-navy">
                {option.label}
              </span>
            </label>
          );
        })}
      </fieldset>

      {changed && (
        <div className="mt-4">
          <label
            htmlFor={`context-text-${question.id}`}
            className="mb-2 block font-sans text-xs font-semibold uppercase tracking-wide text-hive-text-muted"
          >
            Tell Hive what changed…
          </label>
          <textarea
            id={`context-text-${question.id}`}
            data-testid="context-change-text"
            rows={3}
            className="w-full rounded-hive-xl border border-hive-border bg-hive-surface p-4 font-sans text-sm text-hive-navy shadow-hive focus:outline-none focus:ring-2 focus:ring-hive-sage"
            placeholder="Describe what changed…"
            value={value?.changed ? value.description : ""}
            onChange={(event) =>
              onChange({ changed: true, description: event.target.value })
            }
          />
        </div>
      )}
    </QuestionCard>
  );
}
