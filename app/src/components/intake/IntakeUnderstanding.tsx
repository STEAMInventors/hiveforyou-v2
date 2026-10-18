"use client";

import {
  isIntakeRunProcessing,
  isTerminalIntakeRunStatus,
} from "@hiveforyou/shared/intake";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { HiveHandoffSelection } from "@/components/landing/LandingHiveHandoff";
import { commitStagedDocuments } from "@/lib/documents/commit-client";
import {
  clearStoredIntakeRun,
  fetchIntakeRun,
  readStoredIntakeRunId,
  startIntakeRun,
} from "@/lib/intake/intake-client";
import { useStagedDocuments } from "@/lib/intake/staged-documents-context";
import type { ComposerPurpose } from "@/components/UploadExperience";

import type { IntakePreRunPhase } from "@/lib/intake/intake-upload-phases";

import { IntakeProcessingPanel } from "./IntakeProcessingPanel";

const POLL_INTERVAL_MS = 1000;

type OrchestrationFlight = {
  key: string;
  promise: Promise<string>;
};

/** Dedupes commit/start across React Strict Mode remounts for the same submission scope. */
let activeOrchestrationFlight: OrchestrationFlight | null = null;

/** @internal Test hook */
export function resetIntakeOrchestrationFlightForTests(): void {
  activeOrchestrationFlight = null;
}

function customerErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  if (code === "DOCUMENT_COMMIT_FAILED" || code === "CASE_NOT_FOUND") {
    return "We couldn't save your documents. Please try again.";
  }
  if (code === "INTAKE_START_FAILED") {
    return "We couldn't start reading your documents. Please try again later.";
  }
  if (code === "UNAUTHENTICATED") {
    return "Please sign in again.";
  }
  return "We couldn't start reading your documents.";
}

function intakeRunFailureMessage(): string {
  return "We couldn't finish reading your documents. Please try again.";
}

function buildSubmissionScopeKey(input: {
  resumeRunId: string | null | undefined;
  hiveCaseId: string | null | undefined;
  stagedDocumentIds: string[];
}): string {
  if (input.resumeRunId?.trim()) {
    return `resume:${input.resumeRunId.trim()}`;
  }
  const casePart = input.hiveCaseId?.trim() || "no-case";
  const docsPart = [...input.stagedDocumentIds].sort().join("|");
  return `submit:${casePart}:${docsPart}`;
}

export function IntakeUnderstanding({
  resumeRunId,
  composerPurpose,
  hiveCommit,
  onDismiss,
}: {
  resumeRunId?: string | null;
  composerPurpose?: ComposerPurpose | null;
  hiveCommit?: HiveHandoffSelection | null;
  onDismiss?: () => void;
}) {
  const router = useRouter();
  const { documents, adoptPersistedDocuments } = useStagedDocuments();
  const documentsRef = useRef(documents);
  documentsRef.current = documents;
  const hiveCommitRef = useRef(hiveCommit);
  hiveCommitRef.current = hiveCommit;
  const composerPurposeRef = useRef(composerPurpose);
  composerPurposeRef.current = composerPurpose;
  const submitStartedRef = useRef(false);
  /** Client staged ids captured before adoptPersistedDocuments rewrites them. */
  const submissionStagedKeyRef = useRef<string | null>(null);
  if (documents.length > 0 && submissionStagedKeyRef.current === null) {
    submissionStagedKeyRef.current = documents.map((document) => document.id).join("|");
  }
  const submissionStagedKey = submissionStagedKeyRef.current;
  const [view, setView] = useState<Awaited<ReturnType<typeof fetchIntakeRun>> | null>(null);
  const [intakeRunId, setIntakeRunId] = useState<string | null>(resumeRunId ?? null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [preRunPhase, setPreRunPhase] = useState<IntakePreRunPhase>(null);

  const stagedCount = documents.length;

  const openHive = () => {
    const id = view?.intakeRunId ?? intakeRunId;
    if (!id) {
      return;
    }
    clearStoredIntakeRun();
    router.replace(`/intake/${id}`);
  };

  useEffect(() => {
    let cancelled = false;

    async function poll(runId: string) {
      while (!cancelled) {
        const next = await fetchIntakeRun(runId);
        if (cancelled) {
          return;
        }
        setView(next);
        setIntakeRunId(next.intakeRunId);
        if (next.status === "FAILED") {
          setErrorMessage(intakeRunFailureMessage());
          return;
        }
        if (isTerminalIntakeRunStatus(next.status)) {
          return;
        }
        if (!isIntakeRunProcessing(next.status) && next.workspaceReady) {
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    }

    async function commitAndStartIntake(): Promise<string> {
      const stagedDocuments = documentsRef.current;
      const commit = hiveCommitRef.current;
      const purpose = composerPurposeRef.current;
      setPreRunPhase("committing");
      const committed = await commitStagedDocuments(
        stagedDocuments,
        commit
          ? {
              caseId: commit.caseId,
              selectionIntent: commit.selectionIntent,
            }
          : undefined,
      );
      adoptPersistedDocuments(committed);
      setPreRunPhase("starting-intake");
      const started = await startIntakeRun(
        committed.caseId,
        committed.documents.map((document) => document.sourceDocumentId),
        purpose
          ? {
              rawIntent: purpose.rawIntent,
              explicitDomainId: purpose.explicitDomainId,
            }
          : undefined,
      );
      setPreRunPhase(null);
      return started.intakeRunId;
    }

    async function begin() {
      try {
        const resumeId = resumeRunId?.trim() || null;
        if (resumeId) {
          setErrorMessage(null);
          setPreRunPhase(null);
          setIntakeRunId(resumeId);
          await poll(resumeId);
          return;
        }

        const storedRunId = readStoredIntakeRunId();
        if (storedRunId) {
          setErrorMessage(null);
          setPreRunPhase(null);
          setIntakeRunId(storedRunId);
          await poll(storedRunId);
          return;
        }

        const stagedDocuments = documentsRef.current;
        if (stagedDocuments.length === 0) {
          return;
        }

        if (submitStartedRef.current) {
          const existingRunId = readStoredIntakeRunId();
          if (existingRunId) {
            setIntakeRunId(existingRunId);
            await poll(existingRunId);
          }
          return;
        }
        submitStartedRef.current = true;
        setErrorMessage(null);
        setPreRunPhase(null);

        const scopeKey = buildSubmissionScopeKey({
          resumeRunId: resumeId,
          hiveCaseId: hiveCommitRef.current?.caseId,
          stagedDocumentIds: stagedDocuments.map((document) => document.id),
        });

        let runId: string;
        const inFlight =
          activeOrchestrationFlight?.key === scopeKey
            ? activeOrchestrationFlight.promise
            : null;
        if (inFlight) {
          runId = await inFlight;
        } else {
          const promise = commitAndStartIntake();
          activeOrchestrationFlight = { key: scopeKey, promise };
          try {
            runId = await promise;
          } finally {
            if (activeOrchestrationFlight?.promise === promise) {
              activeOrchestrationFlight = null;
            }
          }
        }

        if (cancelled) {
          return;
        }
        setIntakeRunId(runId);
        await poll(runId);
      } catch (error) {
        submitStartedRef.current = false;
        if (!cancelled) {
          setPreRunPhase(null);
          setErrorMessage(customerErrorMessage(error));
        }
      }
    }

    void begin();
    return () => {
      cancelled = true;
    };
  }, [adoptPersistedDocuments, composerPurpose, hiveCommit, resumeRunId, submissionStagedKey]);

  return (
    <section data-testid="intake-understanding" aria-busy={!errorMessage}>
      <IntakeProcessingPanel
        view={view}
        errorMessage={errorMessage}
        composerPurpose={composerPurpose}
        preRunPhase={preRunPhase}
        documentCount={stagedCount}
        onClose={onDismiss}
        onAddMoreFiles={onDismiss}
        onOpenHive={openHive}
      />
    </section>
  );
}
