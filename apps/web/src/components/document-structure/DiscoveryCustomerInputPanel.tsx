"use client";

import type { DiscoverQuestion } from "@hiveforyou/shared/discover";

type DiscoveryCustomerInputPanelProps = {
  questions: DiscoverQuestion[];
  submitting: boolean;
  onSubmit: (answers: Record<string, unknown>[]) => void;
};

export function DiscoveryCustomerInputPanel({
  questions,
  submitting,
  onSubmit,
}: DiscoveryCustomerInputPanelProps) {
  return (
    <form
      className="mx-auto mt-8 max-w-xl rounded-hive-xl border border-hive-border bg-hive-surface p-6 shadow-hive-sm"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const answers: Record<string, unknown>[] = [];
        for (const question of questions) {
          if (question.answerKind === "free_text") {
            const field = form.elements.namedItem(`q-${question.id}`) as HTMLTextAreaElement | null;
            const text = field?.value.trim() ?? "";
            if (!text && question.required) {
              return;
            }
            answers.push({ questionId: question.id, answer: { text } });
            continue;
          }
          const selected = form.querySelector<HTMLInputElement>(
            `input[name="q-${question.id}"]:checked`,
          );
          if (!selected && question.required) {
            return;
          }
          if (selected) {
            answers.push({ questionId: question.id, answer: { choiceId: selected.value } });
          }
        }
        onSubmit(answers);
      }}
    >
      <h2 className="font-serif text-xl font-semibold text-hive-navy">
        Help Hive understand your goal
      </h2>
      <ul className="mt-4 space-y-6">
        {questions.map((question) => (
          <li key={question.id}>
            <label
              htmlFor={`q-${question.id}`}
              className="block font-sans text-base font-medium text-hive-navy"
            >
              {question.prompt}
            </label>
            {question.humanReason && (
              <p className="mt-1 font-sans text-sm text-hive-text-muted">{question.humanReason}</p>
            )}
            {question.answerKind === "free_text" ? (
              <textarea
                id={`q-${question.id}`}
                name={`q-${question.id}`}
                required={question.required}
                rows={4}
                className="mt-2 w-full rounded-hive-lg border border-hive-border px-3 py-2 font-sans text-sm text-hive-navy"
                placeholder="Describe what you want Hive to help you accomplish…"
              />
            ) : (
              <fieldset className="mt-3 space-y-2">
                {question.options.map((option) => (
                  <label
                    key={option.id}
                    className="flex cursor-pointer items-start gap-2 rounded-hive-md border border-hive-border/80 px-3 py-2 font-sans text-sm text-hive-blue"
                  >
                    <input
                      type="radio"
                      name={`q-${question.id}`}
                      value={option.id}
                      required={question.required}
                      className="mt-1"
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </fieldset>
            )}
          </li>
        ))}
      </ul>
      <button
        type="submit"
        disabled={submitting}
        className="mt-6 w-full rounded-hive-lg bg-hive-navy px-4 py-2.5 font-sans text-sm font-semibold text-white disabled:opacity-60"
      >
        {submitting ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}
