"use client";

import { useEffect, useRef, useState } from "react";

import {
  LandingHiveHandoff,
  type HiveHandoffSelection,
} from "@/components/landing/LandingHiveHandoff";
import { LandingUploadDocumentsPreview } from "@/components/landing/LandingUploadDocumentsPreview";
import { LoginRegisterPlaceholder } from "@/components/landing/LoginRegisterPlaceholder";
import { HiveHomeComposer, type HiveComposerSubmit } from "@/components/intake/HiveHomeComposer";
import { IntakeUnderstanding } from "@/components/intake/IntakeUnderstanding";
import { TrustMessage } from "@/components/TrustMessage";
import { readClientSessionStatus } from "@/lib/auth/client-session";
import {
  clearStoredIntakeRun,
  fetchIntakeRun,
  readStoredIntakeRunId,
  clearIntakeRunForNewUpload,
} from "@/lib/intake/intake-client";
import { useStagedDocuments } from "@/lib/intake/staged-documents-context";

export type ComposerPurpose = {
  rawIntent: string;
  explicitDomainId: string | null;
};

type LandingHandoffStep =
  | "composer"
  | "checking-session"
  | "auth-required"
  | "hive-handoff"
  | "upload-documents-preview";

const SESSION_CHECK_ERROR_MESSAGE = "We couldn't check sign-in. Please try again.";

const DOMAIN_LABELS: Record<string, string> = {
  iep: "Special Education / IEP",
};

export function UploadExperience({ showTrustMessage = true }: { showTrustMessage?: boolean }) {
  const { addDocuments, clearDocuments } = useStagedDocuments();
  const [handoffStep, setHandoffStep] = useState<LandingHandoffStep>("composer");
  const [sessionRecheckBusy, setSessionRecheckBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const [resumeRunId, setResumeRunId] = useState<string | null>(null);
  const [composerPurpose, setComposerPurpose] = useState<ComposerPurpose | null>(null);
  const [hiveCommit, setHiveCommit] = useState<HiveHandoffSelection | null>(null);
  const pendingSubmitRef = useRef<HiveComposerSubmit | null>(null);
  const [pendingFileCount, setPendingFileCount] = useState(0);
  const [sessionContinueNotice, setSessionContinueNotice] = useState<string | null>(null);
  const [onboardingPreviewMode, setOnboardingPreviewMode] = useState(false);
  const [previewHiveCommit, setPreviewHiveCommit] = useState<HiveHandoffSelection | null>(null);

  const processing = started || Boolean(resumeRunId);
  const composerVisible = handoffStep === "composer" || handoffStep === "checking-session";

  useEffect(() => {
    let cancelled = false;

    async function restoreInFlightRun() {
      const existing = readStoredIntakeRunId();
      if (!existing) {
        return;
      }
      try {
        const view = await fetchIntakeRun(existing);
        if (cancelled) {
          return;
        }
        if (view.status === "RUNNING") {
          setResumeRunId(existing);
          return;
        }
        clearStoredIntakeRun();
      } catch {
        if (!cancelled) {
          clearStoredIntakeRun();
        }
      }
    }

    void restoreInFlightRun();
    return () => {
      cancelled = true;
    };
  }, []);

  const beginAuthorizedIntake = (payload: HiveComposerSubmit, selection: HiveHandoffSelection) => {
    clearIntakeRunForNewUpload();
    setResumeRunId(null);
    clearDocuments();
    addDocuments(payload.files);
    setHiveCommit(selection);
    setComposerPurpose({
      rawIntent: payload.rawIntent,
      explicitDomainId: payload.explicitDomainId,
    });
    setStarted(true);
    pendingSubmitRef.current = null;
    setHandoffStep("composer");
  };

  const handleComposerSubmit = async (payload: HiveComposerSubmit) => {
    pendingSubmitRef.current = payload;
    setPendingFileCount(payload.files.length);
    setSessionContinueNotice(null);
    setHandoffStep("checking-session");
    const session = await readClientSessionStatus();
    if (session === "authenticated") {
      setHandoffStep("hive-handoff");
      return;
    }
    if (session === "error") {
      setSessionContinueNotice(SESSION_CHECK_ERROR_MESSAGE);
    }
    setHandoffStep("auth-required");
  };

  const handleAuthPlaceholderContinue = async () => {
    setSessionRecheckBusy(true);
    setSessionContinueNotice(null);
    try {
      const session = await readClientSessionStatus();
      if (session === "authenticated") {
        setOnboardingPreviewMode(false);
        setHandoffStep("hive-handoff");
        return;
      }
      if (session === "error") {
        setSessionContinueNotice(SESSION_CHECK_ERROR_MESSAGE);
        return;
      }
      setOnboardingPreviewMode(true);
      setHandoffStep("hive-handoff");
    } catch {
      setSessionContinueNotice(SESSION_CHECK_ERROR_MESSAGE);
    } finally {
      setSessionRecheckBusy(false);
    }
  };

  const beginPreviewUploadStep = (payload: HiveComposerSubmit, selection: HiveHandoffSelection) => {
    setPreviewHiveCommit(selection);
    setComposerPurpose({
      rawIntent: payload.rawIntent,
      explicitDomainId: payload.explicitDomainId,
    });
    setHandoffStep("upload-documents-preview");
  };

  const handleHiveHandoffContinue = (selection: HiveHandoffSelection) => {
    const payload = pendingSubmitRef.current;
    if (!payload) {
      setHandoffStep("composer");
      return;
    }
    if (onboardingPreviewMode) {
      beginPreviewUploadStep(payload, selection);
      return;
    }
    beginAuthorizedIntake(payload, selection);
  };

  const handleBackToComposer = () => {
    setSessionContinueNotice(null);
    setOnboardingPreviewMode(false);
    setPreviewHiveCommit(null);
    setHandoffStep("composer");
  };

  const handleBackToPreviewHiveHandoff = () => {
    setHandoffStep("hive-handoff");
  };

  return (
    <>
      <div
        className={
          composerVisible
            ? processing
              ? "pointer-events-none select-none opacity-[0.42]"
              : undefined
            : "sr-only"
        }
        aria-hidden={!composerVisible ? true : processing ? true : undefined}
      >
        <HiveHomeComposer
          busy={processing || handoffStep === "checking-session"}
          onSubmit={(payload) => {
            void handleComposerSubmit(payload);
          }}
        />
        {showTrustMessage && composerVisible ? <TrustMessage /> : null}
      </div>

      {handoffStep === "auth-required" && !onboardingPreviewMode ? (
        <LoginRegisterPlaceholder
          onBack={handleBackToComposer}
          onSessionAvailable={() => {
            void handleAuthPlaceholderContinue();
          }}
          sessionRecheckBusy={sessionRecheckBusy}
          sessionContinueNotice={sessionContinueNotice}
        />
      ) : null}

      {handoffStep === "hive-handoff" && !processing ? (
        <LandingHiveHandoff
          fileCount={pendingFileCount}
          composerExplicitDomainId={pendingSubmitRef.current?.explicitDomainId ?? null}
          previewMode={onboardingPreviewMode}
          onBack={handleBackToComposer}
          onContinue={handleHiveHandoffContinue}
        />
      ) : null}

      {handoffStep === "upload-documents-preview" && pendingSubmitRef.current && previewHiveCommit ? (
        <LandingUploadDocumentsPreview
          fileCount={pendingFileCount}
          files={pendingSubmitRef.current.files.map((file) => ({
            name: file.name,
            sizeBytes: file.size,
          }))}
          rawIntent={composerPurpose?.rawIntent ?? pendingSubmitRef.current.rawIntent}
          explicitDomainId={
            composerPurpose?.explicitDomainId ?? pendingSubmitRef.current.explicitDomainId
          }
          explicitDomainLabel={
            (composerPurpose?.explicitDomainId ?? pendingSubmitRef.current.explicitDomainId)
              ? DOMAIN_LABELS[
                  composerPurpose?.explicitDomainId ??
                    pendingSubmitRef.current.explicitDomainId ??
                    ""
                ] ?? null
              : null
          }
          hiveCaseId={previewHiveCommit.caseId}
          onBack={handleBackToPreviewHiveHandoff}
        />
      ) : null}

      {processing ? (
        <IntakeUnderstanding
          resumeRunId={started ? null : resumeRunId}
          composerPurpose={started ? composerPurpose : null}
          hiveCommit={started ? hiveCommit : null}
          onDismiss={() => {
            clearStoredIntakeRun();
            setStarted(false);
            setResumeRunId(null);
            setComposerPurpose(null);
            setHiveCommit(null);
            pendingSubmitRef.current = null;
            setHandoffStep("composer");
          }}
        />
      ) : null}
    </>
  );
}
