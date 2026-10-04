"use client";

import { ArrowRight } from "lucide-react";

type StudyCaseCtaProps = {
  enabled: boolean;
  requiredAnswered: number;
  requiredTotal: number;
  onStudy?: () => void;
  submitting?: boolean;
};

export function StudyCaseCta({
  enabled,
  requiredAnswered,
  requiredTotal,
  onStudy,
  submitting = false,
}: StudyCaseCtaProps) {
  return (
    <aside
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-hive-border bg-hive-surface/95 py-4 shadow-[0_-4px_24px_rgba(15,40,56,0.08)] backdrop-blur-md"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
        <div className="text-center sm:text-left">
          {enabled ? (
            <>
              <p className="font-sans text-base font-bold text-hive-navy">
                Hive has enough context to study your case.
              </p>
              <p className="mt-1 font-sans text-sm text-hive-text-muted">
                Hive now has your documents and the context it needs for a deeper
                study.
              </p>
            </>
          ) : (
            <>
              <p className="font-sans text-base font-bold text-hive-navy">
                {requiredAnswered} of {requiredTotal} required answered
              </p>
              <p className="mt-1 font-sans text-sm text-hive-text-muted">
                Answer the required questions above to continue.
              </p>
            </>
          )}
        </div>
        <button
          type="button"
          data-testid="study-case-cta"
          data-enabled={enabled ? "true" : "false"}
          disabled={!enabled || submitting}
          onClick={() => {
            if (enabled && onStudy) {
              onStudy();
            }
          }}
          className={[
            "inline-flex w-full items-center justify-center gap-2 rounded-hive-xl px-8 py-3.5 font-sans text-base font-bold shadow-hive-lg transition-all sm:w-auto",
            enabled
              ? "bg-hive-sage text-hive-text-inverse hover:-translate-y-0.5 hover:bg-hive-sage-muted"
              : "cursor-not-allowed bg-hive-border text-hive-text-muted opacity-70",
          ].join(" ")}
          aria-describedby="study-case-hint"
        >
          <span>Study my case</span>
          <ArrowRight className="h-5 w-5" aria-hidden />
        </button>
      </div>
      <p id="study-case-hint" className="sr-only">
        {enabled
          ? "Begin canonical study when ready."
          : "Complete required questions first."}
      </p>
    </aside>
  );
}
