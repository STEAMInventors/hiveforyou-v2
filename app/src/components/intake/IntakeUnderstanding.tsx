"use client";

import { isIntakeRunProcessing } from "@hiveforyou/shared/intake";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { commitStagedDocuments } from "@/lib/documents/commit-client";
import {
  clearStoredIntakeRun,
  fetchIntakeRun,
  startIntakeRun,
} from "@/lib/intake/intake-client";
import { useStagedDocuments } from "@/lib/intake/staged-documents-context";
import type { ComposerPurpose } from "@/components/UploadExperience";

import type { IntakePreRunPhase } from "@/lib/intake/intake-upload-phases";

import { IntakeProcessingPanel } from "./IntakeProcessingPanel";

const POLL_INTERVAL_MS = 1000;

function customerErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  if (code === "DOCUMENT_COMMIT_FAILED") {
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

export function IntakeUnderstanding({
  resumeRunId,
  composerPurpose,
  onDismiss,
}: {
  resumeRunId?: string | null;
  composerPurpose?: ComposerPurpose | null;
  onDismiss?: () => void;
}) {
  const router = useRouter();
  const { documents } = useStagedDocuments();
  const documentsRef = useRef(documents);
  documentsRef.current = documents;
  const [view, setView] = useState<Awaited<ReturnType<typeof fetchIntakeRun>> | null>(null);
  const [intakeRunId, setIntakeRunId] = useState<string | null>(resumeRunId ?? null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [preRunPhase, setPreRunPhase] = useState<IntakePreRunPhase>(null);

  const stagedKey = documents.map((document) => document.id).join("|");
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
        if (!isIntakeRunProcessing(next.status) && next.workspaceReady) {
          return;
        }
        if (!isIntakeRunProcessing(next.status) && !next.workspaceReady) {
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
          continue;
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    }

    async function begin() {
      setErrorMessage(null);
      setPreRunPhase(null);
      try {
        const stagedDocuments = documentsRef.current;
        if (stagedDocuments.length > 0) {
          setPreRunPhase("committing");
          const committed = await commitStagedDocuments(stagedDocuments);
          if (cancelled) {
            return;
          }
          setPreRunPhase("starting-intake");
          const started = await startIntakeRun(
            committed.caseId,
            committed.documents.map((document) => document.sourceDocumentId),
            composerPurpose
              ? {
                  rawIntent: composerPurpose.rawIntent,
                  explicitDomainId: composerPurpose.explicitDomainId,
                }
              : undefined,
          );
          if (cancelled) {
            return;
          }
          setPreRunPhase(null);
          setIntakeRunId(started.intakeRunId);
          await poll(started.intakeRunId);
          return;
        }
        if (resumeRunId) {
          await poll(resumeRunId);
        }
      } catch (error) {
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
  }, [composerPurpose, resumeRunId, stagedKey]);

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
