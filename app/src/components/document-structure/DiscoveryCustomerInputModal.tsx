"use client";

import { DiscoveryCustomerInputContent } from "@/components/document-structure/DiscoveryCustomerInputContent";
import type { DiscoverQuestion } from "@hiveforyou/shared/discover";

type DiscoveryCustomerInputModalProps = {
  open: boolean;
  mode: "objective" | "clarification";
  questions: DiscoverQuestion[];
  questionIndex: number;
  submitting: boolean;
  onSubmit: (answers: Record<string, unknown>[]) => void;
};

/** Standalone modal wrapper; prefer `DiscoveryWorkflowModal` for the live discover flow. */
export function DiscoveryCustomerInputModal({
  open,
  mode,
  questions,
  questionIndex,
  submitting,
  onSubmit,
}: DiscoveryCustomerInputModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8"
      data-testid="discovery-customer-input-modal"
    >
      <div className="absolute inset-0 bg-hive-navy/40 backdrop-blur-[2px]" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-lg rounded-hive-2xl border border-hive-border bg-hive-surface p-6 shadow-hive-lg sm:p-8"
      >
        <DiscoveryCustomerInputContent
          mode={mode}
          questions={questions}
          questionIndex={questionIndex}
          submitting={submitting}
          onSubmit={onSubmit}
        />
      </div>
    </div>
  );
}
