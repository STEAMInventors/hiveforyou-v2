"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AnswerQuestionsCta } from "@/components/document-structure/AnswerQuestionsCta";
import { DiscoveryCompactInventory } from "@/components/document-structure/DiscoveryCompactInventory";
import { DiscoveryWorkflowModal } from "@/components/document-structure/DiscoveryWorkflowModal";
import { StagedDocumentsCompactList } from "@/components/document-structure/StagedDocumentsCompactList";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { adaptStagedDocumentsToDiscovery } from "@/lib/document-discovery/adapt-staged-to-discovery";
import { logDiscoverClientBoundary } from "@/lib/document-discovery/discover-dev-log";
import {
  rememberClientDiscovery,
  rememberClientDiscoveryRunId,
} from "@/lib/document-discovery/discovery-session";
import { resolveProcessingDomainHint } from "@/lib/document-discovery/processing-domain-label";
import {
  continueDiscoverForStagedDocuments,
  runDiscoverForStagedDocuments,
} from "@/lib/document-discovery/run-discover-client";
import {
  PROCESSING_STAGE_COUNT,
} from "@/lib/document-discovery/processing-stages";
import type { DocumentInspectorSelection } from "@/lib/document-discovery/types";
import type { StagedDocument } from "@/lib/staged-documents";
import {
  audienceResolutionFromDiscovery,
  listSharingAudienceRoles,
} from "@hiveforyou/domain-packs";
import type { CaseCustomerContextIntake } from "@hiveforyou/shared/case-customer-context";
import type { CustomerDiscoveryAnswer, HiveDiscoverResult } from "@hiveforyou/shared/discover";

const STAGE_DURATIONS_MS = [1400, 1600, 1800, 1600];

type DocumentDiscoveryExperienceProps = {
  stagedDocuments: StagedDocument[];
  /** Keep staged collection visible under the modal (upload flow). */
  embedded?: boolean;
  /** When false, discovery API is not started until this flips true. */
  discoveryActive?: boolean;
  /** When true, show the processing modal even if discoveryActive is false (e.g. while persisting uploads). */
  processingModalOpen?: boolean;
  persistError?: string | null;
  onRemoveStagedDocument?: (id: string) => void;
  onAddStagedDocuments?: (files: File[]) => void;
  onSettled?: () => void;
};

export function isAwaitingCustomerInput(result: HiveDiscoverResult | null): boolean {
  return (
    result?.run.status === "NEEDS_OBJECTIVE_INPUT" ||
    result?.run.status === "NEEDS_DISCOVERY_INPUT"
  );
}

export function isDiscoverRunFailed(result: HiveDiscoverResult | null): boolean {
  return result?.run.status === "FAILED";
}

function discoverErrorMessage(result: HiveDiscoverResult | null): string {
  if (result?.run.errorMessage) {
    return result.run.errorMessage;
  }
  if (result?.run.errorCode) {
    return "Document discovery could not be completed. Please try again.";
  }
  return "Document discovery could not be completed. Please try again.";
}

/** Do not settle on the local fixture until the discover API finishes (or fails). */
export function canSettleDocumentDiscovery(input: {
  discoverLoading: boolean;
  discoverContinueInFlight: boolean;
  discoverResult: HiveDiscoverResult | null;
  awaitingInput: boolean;
  /** Modal is open but discover API is gated (e.g. upload persist not finished). */
  discoverAwaitingActivation?: boolean;
}): boolean {
  if (
    input.awaitingInput ||
    input.discoverLoading ||
    input.discoverContinueInFlight ||
    input.discoverAwaitingActivation
  ) {
    return false;
  }
  if (input.discoverResult?.documentDiscovery) {
    return true;
  }
  if (input.discoverResult === null) {
    return true;
  }
  return false;
}

export function shouldShowDiscoverProcessingError(input: {
  discoverLoading: boolean;
  discoverContinueInFlight: boolean;
  discoverResult: HiveDiscoverResult | null;
  awaitingInput: boolean;
  persistError?: string | null;
}): boolean {
  if (input.persistError) {
    return true;
  }
  if (input.discoverLoading || input.discoverContinueInFlight || input.awaitingInput) {
    return false;
  }
  if (isDiscoverRunFailed(input.discoverResult)) {
    return true;
  }
  if (input.discoverResult && !input.discoverResult.documentDiscovery) {
    return true;
  }
  return false;
}

export function DocumentDiscoveryExperience({
  stagedDocuments,
  embedded = false,
  discoveryActive = true,
  processingModalOpen,
  persistError = null,
  onRemoveStagedDocument,
  onAddStagedDocuments,
  onSettled,
}: DocumentDiscoveryExperienceProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const stagedDocumentIdsKey = useMemo(
    () =>
      stagedDocuments
        .map((doc) => doc.id)
        .sort()
        .join(","),
    [stagedDocuments],
  );
  const fallbackDiscovery = useMemo(
    () => adaptStagedDocumentsToDiscovery(stagedDocuments),
    [stagedDocumentIdsKey, stagedDocuments],
  );
  const [discovery, setDiscovery] = useState(fallbackDiscovery);
  const [discoverResult, setDiscoverResult] = useState<HiveDiscoverResult | null>(null);
  const [discoverLoading, setDiscoverLoading] = useState(discoveryActive);
  const [discoverContinueInFlight, setDiscoverContinueInFlight] = useState(false);
  const [submittingInput, setSubmittingInput] = useState(false);
  const [discoverRequestError, setDiscoverRequestError] = useState<string | null>(null);
  const [discoverAttempt, setDiscoverAttempt] = useState(0);
  const [clarificationIndex, setClarificationIndex] = useState(0);
  const modalVisible = processingModalOpen ?? discoveryActive;
  const discoverAwaitingActivation = processingModalOpen === true && !discoveryActive;

  useEffect(() => {
    setDiscovery(fallbackDiscovery);
    setDiscoverResult(null);
    setClarificationIndex(0);
    setDiscoverLoading(discoveryActive);
  }, [stagedDocumentIdsKey, fallbackDiscovery, discoveryActive]);

  useEffect(() => {
    if (!discoveryActive) {
      setDiscoverLoading(false);
      return;
    }
    let cancelled = false;
    setDiscoverLoading(true);
    setDiscoverRequestError(null);
    logDiscoverClientBoundary("run:start", {
      documentCount: stagedDocuments.length,
      stagedDocumentIdsKey,
    });
    void runDiscoverForStagedDocuments(stagedDocuments)
      .then((result) => {
        if (cancelled) {
          return;
        }
        logDiscoverClientBoundary("run:response", {
          status: result.run.status,
          phase: result.run.phase,
          hasDocumentDiscovery: Boolean(result.documentDiscovery),
          questionCount: result.discoveryQuestions?.length ?? 0,
        });
        setDiscoverResult(result);
        if (result.run.discoverRunId) {
          rememberClientDiscoveryRunId(result.run.discoverRunId);
        }
        if (result.documentDiscovery) {
          rememberClientDiscovery(result.documentDiscovery);
          setDiscovery(result.documentDiscovery);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        logDiscoverClientBoundary("run:failed", {
          message: error instanceof Error ? error.message : "unknown",
        });
        /* Keep local fixture-shaped fallback when discover API is unavailable (e.g. vitest). */
      })
      .finally(() => {
        if (!cancelled) {
          setDiscoverLoading(false);
          logDiscoverClientBoundary("run:finished");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [discoveryActive, stagedDocumentIdsKey, stagedDocuments, discoverAttempt]);

  const audienceRoles = useMemo(() => {
    const fromCollection = discoverResult?.collectionUnderstanding?.domainGroups[0];
    const resolvedFromCollection =
      fromCollection &&
      discoverResult?.collectionUnderstanding?.domainResolutionStatus !== "MULTI_DOMAIN"
        ? {
            domainResolved: true,
            domainId: fromCollection.domainId,
            domainLabel: fromCollection.domainLabel,
          }
        : null;
    return listSharingAudienceRoles(
      resolvedFromCollection ??
        audienceResolutionFromDiscovery({
          structureMap: discoverResult?.structureMap,
          documentDiscovery: discoverResult?.documentDiscovery,
        }),
    );
  }, [discoverResult]);

  const awaitingInput = isAwaitingCustomerInput(discoverResult);
  const pendingQuestions = discoverResult?.discoveryQuestions ?? [];
  const inputMode =
    discoverResult?.run.status === "NEEDS_OBJECTIVE_INPUT" ? "objective" : "clarification";

  const resumeProcessingStages = useCallback(() => {
    setSettled(false);
    setStageIndex(0);
  }, []);

  const continueWithAnswers = useCallback(
    async (input: {
      customerAnswers: CustomerDiscoveryAnswer[];
      caseCustomerContextIntake?: CaseCustomerContextIntake;
    }) => {
      if (!discoverResult?.run.discoverRunId || !input.customerAnswers.length) {
        return;
      }
      setSubmittingInput(true);
      setDiscoverContinueInFlight(true);
      setDiscoverRequestError(null);
      resumeProcessingStages();
      logDiscoverClientBoundary("continue:start", {
        discoverRunId: discoverResult.run.discoverRunId,
        answerCount: input.customerAnswers.length,
        priorStatus: discoverResult.run.status,
      });
      try {
        const continued = await continueDiscoverForStagedDocuments({
          stagedDocuments,
          discoverRunId: discoverResult.run.discoverRunId,
          customerAnswers: input.customerAnswers,
          caseCustomerContextIntake: input.caseCustomerContextIntake,
        });
        logDiscoverClientBoundary("continue:response", {
          status: continued.run.status,
          phase: continued.run.phase,
          hasDocumentDiscovery: Boolean(continued.documentDiscovery),
          questionCount: continued.discoveryQuestions?.length ?? 0,
          errorCode: continued.run.errorCode,
        });
        setDiscoverResult(continued);
        if (continued.run.discoverRunId) {
          rememberClientDiscoveryRunId(continued.run.discoverRunId);
        }
        if (continued.documentDiscovery) {
          rememberClientDiscovery(continued.documentDiscovery);
          setDiscovery(continued.documentDiscovery);
        }
        if (continued.run.status === "NEEDS_DISCOVERY_INPUT") {
          setClarificationIndex((index) => index + 1);
        } else {
          setClarificationIndex(0);
        }
      } catch (error: unknown) {
        const raw =
          error instanceof Error && error.message
            ? error.message
            : "Discover continue could not be completed.";
        const message = raw.match(/message=(.*)$/)?.[1] ?? raw;
        logDiscoverClientBoundary("continue:failed", { message });
        // #region agent log
        fetch("http://127.0.0.1:7344/ingest/7ae07fd2-7632-4025-a5a9-82301d42c479", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "4a15b7" },
          body: JSON.stringify({
            sessionId: "4a15b7",
            runId: "post-fix",
            hypothesisId: "F",
            location: "DocumentDiscoveryExperience.tsx:continue-failed",
            message: "continue failed; keep error visible",
            data: { message },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        setDiscoverRequestError(message);
      } finally {
        setSubmittingInput(false);
        setDiscoverContinueInFlight(false);
        logDiscoverClientBoundary("continue:finished");
      }
    },
    [discoverResult, resumeProcessingStages, stagedDocuments],
  );

  const handleCustomerSubmit = useCallback(
    async (rawAnswers: Record<string, unknown>[]) => {
      if (!discoverResult?.run.discoverRunId || !rawAnswers.length) {
        return;
      }
      const customerAnswers: CustomerDiscoveryAnswer[] = rawAnswers.map((entry) => {
        const questionId = String(entry.questionId);
        const answer = entry.answer as Record<string, unknown>;
        return {
          questionId,
          evidenceKind: "CUSTOMER_ASSERTION",
          answer,
          answeredAt: new Date().toISOString(),
          userId: "client",
          discoverRunId: discoverResult.run.discoverRunId,
          caseId: discoverResult.run.caseId,
        };
      });
      await continueWithAnswers({ customerAnswers });
    },
    [continueWithAnswers, discoverResult],
  );

  const handleObjectiveIntakeSubmit = useCallback(
    async (payload: {
      intake: CaseCustomerContextIntake;
      objectiveAnswers: { questionId: string; answer: Record<string, unknown> }[];
    }) => {
      if (!discoverResult?.run.discoverRunId || !payload.objectiveAnswers.length) {
        return;
      }
      const customerAnswers: CustomerDiscoveryAnswer[] = payload.objectiveAnswers.map((item) => ({
        questionId: item.questionId,
        evidenceKind: "CUSTOMER_ASSERTION",
        answer: item.answer,
        answeredAt: new Date().toISOString(),
        userId: "client",
        discoverRunId: discoverResult.run.discoverRunId,
        caseId: discoverResult.run.caseId,
      }));
      await continueWithAnswers({
        customerAnswers,
        caseCustomerContextIntake: payload.intake,
      });
    },
    [continueWithAnswers, discoverResult],
  );

  const [stageIndex, setStageIndex] = useState(0);
  const [settled, setSettled] = useState(false);
  const [selection, setSelection] = useState<DocumentInspectorSelection>(null);

  const discoverInFlight = discoverLoading || discoverContinueInFlight;
  const processingErrorVisible = shouldShowDiscoverProcessingError({
    discoverLoading,
    discoverContinueInFlight,
    discoverResult,
    awaitingInput,
    persistError,
  });
  const processingErrorMessage =
    persistError ??
    discoverRequestError ??
    (isDiscoverRunFailed(discoverResult) ? discoverErrorMessage(discoverResult) : null) ??
    (discoverResult && !discoverResult.documentDiscovery && !awaitingInput && !discoverInFlight
      ? "Document discovery returned an incomplete result. Please try again."
      : null);

  const canSettleAfterProcessing = canSettleDocumentDiscovery({
    discoverLoading,
    discoverContinueInFlight,
    discoverResult,
    awaitingInput,
    discoverAwaitingActivation,
  });
  const discoveryReady = canSettleAfterProcessing;
  const processingDomainHint = useMemo(() => {
    const hint = resolveProcessingDomainHint({ discoverResult });
    return hint.kind === "resolved" ? { label: hint.label } : null;
  }, [discoverResult]);

  const retryDiscover = useCallback(() => {
    setDiscoverRequestError(null);
    setDiscoverResult(null);
    setClarificationIndex(0);
    resumeProcessingStages();
    setDiscoverAttempt((value) => value + 1);
  }, [resumeProcessingStages]);

  useEffect(() => {
    if (awaitingInput) {
      setSettled(false);
      return;
    }
    if (discoveryReady && discoverResult?.documentDiscovery && !settled) {
      setStageIndex(PROCESSING_STAGE_COUNT - 1);
      setSettled(true);
    }
  }, [awaitingInput, discoverResult, discoveryReady, settled]);

  useEffect(() => {
    if (settled) {
      onSettled?.();
    }
  }, [settled, onSettled]);

  useEffect(() => {
    if (prefersReducedMotion) {
      setStageIndex(PROCESSING_STAGE_COUNT - 1);
      if (!awaitingInput && discoveryReady && canSettleAfterProcessing) {
        setSettled(true);
      }
      return;
    }

    if (settled || processingErrorVisible) {
      return;
    }

    const customerInputBlocksStages = awaitingInput && !submittingInput;
    if (customerInputBlocksStages) {
      return;
    }

    const duration = STAGE_DURATIONS_MS[stageIndex] ?? 1000;
    const timer = window.setTimeout(() => {
      if (stageIndex >= PROCESSING_STAGE_COUNT - 1) {
        if (discoveryReady && canSettleAfterProcessing) {
          setSettled(true);
        }
        return;
      }
      setStageIndex((value) => value + 1);
    }, duration);

    return () => window.clearTimeout(timer);
  }, [
    stageIndex,
    settled,
    prefersReducedMotion,
    awaitingInput,
    submittingInput,
    processingErrorVisible,
    discoveryReady,
    canSettleAfterProcessing,
  ]);

  const modalOpen = modalVisible && !settled;
  const modalView =
    discoverRequestError
      ? "processing"
      : awaitingInput && pendingQuestions.length > 0 && !submittingInput
        ? "customer-input"
        : "processing";

  // #region agent log
  useEffect(() => {
    fetch("http://127.0.0.1:7344/ingest/7ae07fd2-7632-4025-a5a9-82301d42c479", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "4a15b7" },
      body: JSON.stringify({
        sessionId: "4a15b7",
        runId: "pre-fix",
        hypothesisId: "A-D",
        location: "DocumentDiscoveryExperience.tsx:modal",
        message: "discovery modal state",
        data: {
          modalOpen,
          modalView,
          stageIndex,
          settled,
          discoverLoading,
          discoverContinueInFlight,
          awaitingInput,
          submittingInput,
          questionCount: pendingQuestions.length,
          objectiveQuestionCount: pendingQuestions.filter(
            (item) =>
              item.questionKey === "discovery.objective" ||
              item.questionKey.startsWith("discovery.objective."),
          ).length,
          status: discoverResult?.run.status ?? null,
          phase: discoverResult?.run.phase ?? null,
          errorCode: discoverResult?.run.errorCode ?? null,
          hasDocumentDiscovery: Boolean(discoverResult?.documentDiscovery),
          processingErrorVisible,
          discoveryReady,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }, [
    modalOpen,
    modalView,
    stageIndex,
    settled,
    discoverLoading,
    discoverContinueInFlight,
    awaitingInput,
    submittingInput,
    pendingQuestions,
    discoverResult,
    processingErrorVisible,
    discoveryReady,
  ]);
  // #endregion

  const showStagedUnderlay =
    embedded && !settled && onRemoveStagedDocument && onAddStagedDocuments;

  return (
    <div
      data-testid="document-discovery-experience"
      className={[
        "relative flex w-full flex-col",
        embedded ? "max-w-4xl" : "max-w-6xl",
      ].join(" ")}
    >
      {showStagedUnderlay ? (
        <StagedDocumentsCompactList
          documents={stagedDocuments}
          onRemove={onRemoveStagedDocument}
          onFilesAdded={onAddStagedDocuments}
          dimmed={modalOpen}
        />
      ) : null}

      {!embedded && !settled && stagedDocuments.length > 0 ? (
        <div className="mb-6 opacity-60">
          <StagedDocumentsCompactList
            documents={stagedDocuments}
            onRemove={() => {}}
            onFilesAdded={() => {}}
            dimmed
          />
        </div>
      ) : null}

      {settled ? (
        <>
          <header className="mb-6 text-center lg:mb-8">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-hive-soft-sky/70 px-3 py-1 text-hive-blue">
              <span className="h-2 w-2 rounded-full bg-hive-sage" aria-hidden />
              <span className="font-mono text-xs font-medium sm:text-sm">
                Document structure ready
              </span>
            </div>
            <h1 className="font-serif text-3xl font-bold tracking-tight text-hive-navy sm:text-4xl">
              Your documents are organized.
            </h1>
            <p className="mx-auto mt-3 max-w-2xl font-sans text-base text-hive-blue sm:text-lg">
              Hive recognized your files, placed them in sequence, and noted what may still be
              missing. Review the inventory, then continue when you&apos;re ready.
            </p>
          </header>

          <DiscoveryCompactInventory
            discovery={discovery}
            selection={selection}
            onSelect={setSelection}
            onCloseInspector={() => setSelection(null)}
          />

          <div className="mt-10">
            <AnswerQuestionsCta />
          </div>
        </>
      ) : null}

      <DiscoveryWorkflowModal
        open={modalOpen}
        view={modalView}
        activeStageIndex={stageIndex}
        stagedDocuments={stagedDocuments}
        domainHint={processingDomainHint}
        processingError={modalView === "processing" ? processingErrorMessage : null}
        onProcessingRetry={
          processingErrorMessage && discoveryActive ? retryDiscover : undefined
        }
        inputMode={inputMode}
        questions={pendingQuestions}
        audienceRoles={audienceRoles}
        collectionUnderstanding={discoverResult?.collectionUnderstanding}
        questionIndex={inputMode === "clarification" ? clarificationIndex : 0}
        submittingInput={submittingInput}
        onCustomerSubmit={handleCustomerSubmit}
        onObjectiveIntakeSubmit={handleObjectiveIntakeSubmit}
      />
    </div>
  );
}
