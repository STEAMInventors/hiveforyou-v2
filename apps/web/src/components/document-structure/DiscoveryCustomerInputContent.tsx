"use client";

import { useEffect, useId, useRef } from "react";

import type { DiscoverQuestion } from "@hiveforyou/shared/discover";

const OBJECTIVE_QUESTION_KEY = "discovery.objective";

export type DiscoveryCustomerInputContentProps = {
  mode: "objective" | "clarification";
  questions: DiscoverQuestion[];
  questionIndex: number;
  submitting: boolean;
  onSubmit: (answers: Record<string, unknown>[]) => void;
};

export function DiscoveryCustomerInputContent({
  mode,
  questions,
  questionIndex,
  submitting,
  onSubmit,
}: DiscoveryCustomerInputContentProps) {
  const titleId = useId();
  const formRef = useRef<HTMLFormElement>(null);

  const visibleQuestions =
    mode === "objective"
      ? questions
      : questions.filter((item) => item.questionKey !== OBJECTIVE_QUESTION_KEY);

  const currentQuestion = visibleQuestions[questionIndex] ?? visibleQuestions[0];
  const total = visibleQuestions.length;
  const position = currentQuestion ? questionIndex + 1 : 0;

  useEffect(() => {
    if (!formRef.current || !currentQuestion) {
      return;
    }
    const focusable = formRef.current.querySelector<HTMLElement>(
      "textarea, input, button[type='submit']",
    );
    focusable?.focus();
  }, [currentQuestion?.id]);

  if (!currentQuestion) {
    return null;
  }

  const heading =
    mode === "objective" ? "What should Hive focus on?" : "A few quick clarifications";

  return (
    <div data-testid="discovery-customer-input-content">
      <p className="font-mono text-[10px] font-medium uppercase tracking-wide text-hive-blue sm:text-xs">
        {mode === "clarification" && total > 1 ? `${position} of ${total}` : "Your input"}
      </p>
      <h2 id={titleId} className="mt-1.5 font-serif text-xl font-semibold text-hive-navy sm:text-2xl">
        {heading}
      </h2>

      <form
        ref={formRef}
        className="mt-4"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const question = currentQuestion;
          if (question.answerKind === "free_text") {
            const field = form.elements.namedItem(`q-${question.id}`) as
              | HTMLTextAreaElement
              | null;
            const text = field?.value.trim() ?? "";
            if (!text && question.required) {
              return;
            }
            onSubmit([{ questionId: question.id, answer: { text } }]);
            return;
          }
          const selected = form.querySelector<HTMLInputElement>(
            `input[name="q-${question.id}"]:checked`,
          );
          if (!selected && question.required) {
            return;
          }
          if (selected) {
            onSubmit([{ questionId: question.id, answer: { choiceId: selected.value } }]);
          }
        }}
      >
        <div>
          <label
            htmlFor={`q-${currentQuestion.id}`}
            className="block font-sans text-sm font-medium text-hive-navy sm:text-base"
          >
            {currentQuestion.prompt}
          </label>
          {currentQuestion.humanReason && (
            <p className="mt-1 font-sans text-xs text-hive-text-muted sm:text-sm">
              {currentQuestion.humanReason}
            </p>
          )}
          {currentQuestion.answerKind === "free_text" ? (
            <textarea
              id={`q-${currentQuestion.id}`}
              name={`q-${currentQuestion.id}`}
              required={currentQuestion.required}
              rows={3}
              className="mt-2 w-full rounded-hive-lg border border-hive-border px-3 py-2 font-sans text-sm text-hive-navy"
              placeholder="Describe what you want Hive to help you accomplish…"
            />
          ) : (
            <fieldset className="mt-2 space-y-1.5">
              {currentQuestion.options.map((option) => (
                <label
                  key={option.id}
                  className="flex cursor-pointer items-start gap-2 rounded-hive-md border border-hive-border/80 px-3 py-2 font-sans text-sm text-hive-blue"
                >
                  <input
                    type="radio"
                    name={`q-${currentQuestion.id}`}
                    value={option.id}
                    required={currentQuestion.required}
                    className="mt-0.5"
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </fieldset>
          )}
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="mt-5 w-full rounded-hive-lg bg-hive-navy px-4 py-2.5 font-sans text-sm font-semibold text-white disabled:opacity-60"
        >
          {submitting ? "Saving…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
