import type { ReactNode } from "react";

import { QUESTION_GROUP_LABELS, type QuestionGroupId } from "@/lib/questions/types";

type QuestionGroupProps = {
  groupId: QuestionGroupId;
  questionCount: number;
  children: ReactNode;
};

export function QuestionGroup({
  groupId,
  questionCount,
  children,
}: QuestionGroupProps) {
  return (
    <section
      data-testid={`question-group-${groupId}`}
      className="space-y-4"
      aria-labelledby={`question-group-heading-${groupId}`}
    >
      <header className="flex items-center justify-between border-b border-hive-border pb-2">
        <h2
          id={`question-group-heading-${groupId}`}
          className="font-serif text-lg font-bold text-hive-navy sm:text-xl"
        >
          {QUESTION_GROUP_LABELS[groupId]}
        </h2>
        <span className="rounded-hive-md bg-hive-page px-2 py-0.5 font-mono text-xs text-hive-text-muted">
          {questionCount} question{questionCount === 1 ? "" : "s"}
        </span>
      </header>
      <div className="space-y-6">{children}</div>
    </section>
  );
}
