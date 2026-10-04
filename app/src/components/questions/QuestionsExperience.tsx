"use client";

import { QuestionsSessionProvider } from "@/lib/questions/questions-session-context";

import { QuestionWorkspace } from "./QuestionWorkspace";

export function QuestionsExperience() {
  return (
    <QuestionsSessionProvider>
      <div
        data-testid="questions-experience"
        className="mx-auto w-full max-w-3xl px-6"
      >
        <header className="pb-8 pt-4 text-center sm:pt-8">
          <h1 className="font-serif text-3xl font-bold tracking-tight text-hive-navy sm:text-4xl">
            A few things will help complete the picture.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl font-sans text-base leading-relaxed text-hive-text-muted sm:text-lg">
            Hive organized your documents. These few answers will help it
            understand what may be missing, what has changed, and what matters
            most to you.
          </p>
        </header>
        <QuestionWorkspace />
      </div>
    </QuestionsSessionProvider>
  );
}
