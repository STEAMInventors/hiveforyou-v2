import type { ReactNode } from "react";

type QuestionCardProps = {
  questionId: string;
  kicker?: string;
  prompt: string;
  reason: ReactNode;
  answered?: boolean;
  children: ReactNode;
};

export function QuestionCard({
  questionId,
  kicker,
  prompt,
  reason,
  answered = false,
  children,
}: QuestionCardProps) {
  return (
    <article
      data-testid={`question-card-${questionId}`}
      data-answered={answered ? "true" : "false"}
      className={[
        "rounded-hive-2xl border border-hive-border bg-hive-surface p-6 shadow-hive sm:p-8",
        answered ? "border-hive-border/80 bg-hive-surface/95" : "",
      ].join(" ")}
    >
      {kicker && (
        <p className="mb-2 font-sans text-xs font-bold uppercase tracking-wider text-hive-sage">
          {kicker}
        </p>
      )}
      <h2 className="font-serif text-xl font-bold text-hive-navy sm:text-2xl">
        {prompt}
      </h2>
      <div className="mt-3 mb-6">{reason}</div>
      {children}
      {answered && (
        <p className="mt-4 font-sans text-xs text-hive-text-muted" role="status">
          Answer recorded — you can change it anytime before continuing.
        </p>
      )}
    </article>
  );
}
