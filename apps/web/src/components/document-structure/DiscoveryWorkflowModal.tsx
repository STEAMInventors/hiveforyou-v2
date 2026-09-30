"use client";

import { DiscoveryCustomerInputContent } from "@/components/document-structure/DiscoveryCustomerInputContent";
import { DiscoveryObjectiveIntakeContent } from "@/components/document-structure/DiscoveryObjectiveIntakeContent";
import { DiscoveryProcessingPanel } from "@/components/document-structure/DiscoveryProcessingPanel";
import type { StagedDocument } from "@/lib/staged-documents";
import type { SharingAudienceRoleOption } from "@hiveforyou/domain-packs";
import type { CaseCustomerContextIntake } from "@hiveforyou/shared/case-customer-context";
import type { DiscoverCollectionUnderstanding, DiscoverQuestion } from "@hiveforyou/shared/discover";

type DiscoveryWorkflowModalProps = {
  open: boolean;
  view: "processing" | "customer-input";
  activeStageIndex: number;
  stagedDocuments: StagedDocument[];
  domainHint?: { label: string } | null;
  processingError?: string | null;
  onProcessingRetry?: () => void;
  inputMode: "objective" | "clarification";
  questions: DiscoverQuestion[];
  audienceRoles: SharingAudienceRoleOption[];
  collectionUnderstanding?: DiscoverCollectionUnderstanding;
  questionIndex: number;
  submittingInput: boolean;
  onCustomerSubmit: (answers: Record<string, unknown>[]) => void;
  onObjectiveIntakeSubmit?: (payload: {
    intake: CaseCustomerContextIntake;
    objectiveAnswers: { questionId: string; answer: Record<string, unknown> }[];
  }) => void;
};

export function DiscoveryWorkflowModal({
  open,
  view,
  activeStageIndex,
  stagedDocuments,
  domainHint = null,
  processingError = null,
  onProcessingRetry,
  inputMode,
  questions,
  audienceRoles,
  collectionUnderstanding,
  questionIndex,
  submittingInput,
  onCustomerSubmit,
  onObjectiveIntakeSubmit,
}: DiscoveryWorkflowModalProps) {
  const objectiveQuestions = questions.filter(
    (item) =>
      item.questionKey === "discovery.objective" ||
      item.questionKey.startsWith("discovery.objective."),
  );
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 sm:py-8"
      data-testid="discovery-workflow-modal"
    >
      <div
        className="absolute inset-0 bg-hive-navy/35 backdrop-blur-[3px]"
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-busy={view === "processing"}
        aria-label={
          view === "customer-input"
            ? inputMode === "objective"
              ? "Discovery objective"
              : "Discovery clarification"
            : "Organizing your documents"
        }
        className="relative z-10 w-full min-w-0 max-w-[min(100%,680px)] rounded-hive-2xl border border-hive-border bg-hive-surface px-5 py-6 shadow-hive-lg sm:min-w-[560px] sm:px-7 sm:py-7"
      >
        {view === "customer-input" ? (
          inputMode === "objective" && objectiveQuestions.length > 0 && onObjectiveIntakeSubmit ? (
            <DiscoveryObjectiveIntakeContent
              objectiveQuestions={objectiveQuestions}
              collectionUnderstanding={collectionUnderstanding}
              audienceRoles={audienceRoles}
              submitting={submittingInput}
              onSubmit={onObjectiveIntakeSubmit}
            />
          ) : (
            <DiscoveryCustomerInputContent
              mode={inputMode}
              questions={questions}
              questionIndex={questionIndex}
              submitting={submittingInput}
              onSubmit={onCustomerSubmit}
            />
          )
        ) : (
          <DiscoveryProcessingPanel
            compact
            activeStageIndex={activeStageIndex}
            stagedDocuments={stagedDocuments}
            domainHint={domainHint}
            errorMessage={processingError}
            onRetry={onProcessingRetry}
          />
        )}
      </div>
    </div>
  );
}
