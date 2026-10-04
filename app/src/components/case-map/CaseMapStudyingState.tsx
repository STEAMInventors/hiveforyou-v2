"use client";

import { useEffect, useState } from "react";

const STUDYING_MESSAGES = [
  "Understanding the case",
  "Connecting the evidence",
  "Building the timeline",
  "Organizing what matters",
] as const;

type CaseMapStudyingStateProps = {
  rootLabel?: string;
};

export function CaseMapStudyingState({ rootLabel = "Your case" }: CaseMapStudyingStateProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const reducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (reducedMotion) {
      return;
    }
    const timer = setInterval(() => {
      setMessageIndex((index) => (index + 1) % STUDYING_MESSAGES.length);
    }, 3200);
    return () => clearInterval(timer);
  }, [reducedMotion]);

  return (
    <div
      data-testid="case-map-studying"
      className="mx-auto flex max-w-3xl flex-col items-center px-6 py-20 text-center"
    >
      <div
        className="relative flex h-28 w-28 items-center justify-center rounded-full border border-hive-border/80 bg-hive-surface shadow-hive-sm motion-safe:animate-pulse motion-reduce:animate-none"
        aria-hidden
      >
        <span className="font-serif text-lg font-bold text-hive-navy">{rootLabel.slice(0, 1)}</span>
      </div>
      <p className="mt-8 font-serif text-2xl font-bold text-hive-navy">{rootLabel}</p>
      <p
        className="mt-4 font-sans text-sm text-hive-text-muted"
        role="status"
        aria-live="polite"
        data-testid="case-map-studying-message"
      >
        {STUDYING_MESSAGES[messageIndex]}
      </p>
      <div className="mt-10 flex w-full max-w-md gap-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full bg-hive-border/60 motion-safe:animate-pulse motion-reduce:animate-none"
            style={{ animationDelay: `${i * 200}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
