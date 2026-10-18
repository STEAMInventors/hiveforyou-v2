"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { CanonicalStudyReportProjection } from "@hiveforyou/shared/canonical-study-report-projection";
import { isStudyRunProcessing } from "@hiveforyou/shared/canonical-study";
import type { CanonicalStudyArtifact } from "@hiveforyou/shared/canonical-study-artifact";
import type { HiveUiTree } from "@hiveforyou/shared/hive-ui-tree";

import { resolveCanonicalStudyExperienceState } from "@/lib/hive-customer/canonical-study-experience-model";
import { fetchHiveExtractionProgress } from "@/lib/hive-customer/hive-extraction-progress-client";
import type { HiveExtractionProgressView } from "@/lib/hive-customer/hive-extraction-progress-types";
import { runDeterministicCanonicalStudyFromClient } from "@/lib/hive-customer/run-deterministic-canonical-study-client";
import { startIntakeStudy } from "@/lib/intake/intake-client";
import {
  buildCaseReportsHref,
  buildCaseDocumentsHref,
  buildMyCasesHref,
  isCanonicalStudyPresentationReady,
} from "@/lib/intake/study-completion-navigation";

import { CanonicalStudyBuildConfirmModal } from "./CanonicalStudyBuildConfirmModal";
import { CanonicalStudyExperiencePanel } from "./CanonicalStudyExperiencePanel";
import { HiveCustomerShell } from "./HiveCustomerShell";

const POLL_MS = 2500;

type CanonicalStudyDebugArtifact = CanonicalStudyArtifact & {
  readerPack?: unknown;
  canonicalRuleset?: unknown;
};

type ReportPayload = CanonicalStudyReportProjection & { hiveUiTree?: HiveUiTree | null };

export function CanonicalStudyJsonView({
  caseId,
  studyRunId,
  intakeRunId: intakeRunIdProp,
  workspaceAudience,
}: {
  caseId: string;
  studyRunId: string;
  intakeRunId?: string | null;
  workspaceAudience?: "customer" | "pro";
}) {
  const [progress, setProgress] = useState<HiveExtractionProgressView | null>(null);
  const [projection, setProjection] = useState<ReportPayload | null>(null);
  const [artifact, setArtifact] = useState<CanonicalStudyDebugArtifact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generateState, setGenerateState] = useState<"idle" | "running">("idle");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [showJson, setShowJson] = useState(false);
  const [buildModalOpen, setBuildModalOpen] = useState(false);

  const intakeRunId = progress?.intakeRunId ?? intakeRunIdProp ?? null;

  const loadProgress = useCallback(async () => {
    try {
      const next = await fetchHiveExtractionProgress(caseId, studyRunId);
      setProgress(next);
      return next;
    } catch {
      return null;
    }
  }, [caseId, studyRunId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const reportResponse = await fetch(
        `/api/case/${encodeURIComponent(caseId)}/canonical-report?studyRunId=${encodeURIComponent(studyRunId)}&audience=customer`,
      );
      if (reportResponse.ok) {
        const reportPayload = (await reportResponse.json()) as ReportPayload;
        setProjection(reportPayload);
      } else if (reportResponse.status === 404) {
        setProjection(null);
        const latestProgress = progress ?? (await loadProgress());
        if (
          latestProgress &&
          isCanonicalStudyPresentationReady(latestProgress.studyRunStatus)
        ) {
          setError(null);
        }
      } else {
        setProjection(null);
      }

      const response = await fetch(
        `/api/case/${encodeURIComponent(caseId)}/canonical-debug?studyRunId=${encodeURIComponent(studyRunId)}`,
      );
      const payload = (await response.json()) as CanonicalStudyDebugArtifact & {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        setArtifact(null);
        if (response.status !== 404) {
          setError(payload.message ?? payload.error ?? "Could not load canonical study.");
        }
        return;
      }
      setArtifact(payload);
    } catch {
      setArtifact(null);
      setProjection(null);
      setError("Network error while loading canonical study.");
    } finally {
      setLoading(false);
    }
  }, [caseId, loadProgress, progress, studyRunId]);

  useEffect(() => {
    void loadProgress();
  }, [loadProgress]);

  useEffect(() => {
    void load();
  }, [load]);

  const openAiOnly =
    !projection &&
    !artifact &&
    progress != null &&
    isCanonicalStudyPresentationReady(progress.studyRunStatus) &&
    progress.extractionCompleteForExplore !== true;

  const hasAcceptedStudyContent = Boolean(projection || artifact || openAiOnly);

  const studyProcessing =
    progress != null && isStudyRunProcessing(progress.studyRunStatus);
  const canGenerate =
    progress?.extractionCompleteForExplore === true || Boolean(intakeRunId);

  const experienceState = resolveCanonicalStudyExperienceState({
    loading,
    hasAcceptedStudyContent,
    extractionCompleteForExplore: progress?.extractionCompleteForExplore === true,
    canGenerate,
    studyRunStatus: progress?.studyRunStatus,
    generateInFlight: generateState === "running",
  });

  const shouldPoll =
    studyProcessing ||
    generateState === "running" ||
    experienceState === "processing";

  useEffect(() => {
    if (!shouldPoll) {
      return;
    }
    const timer = window.setInterval(() => {
      void loadProgress().then((next) => {
        if (
          next &&
          !isStudyRunProcessing(next.studyRunStatus) &&
          generateState === "idle"
        ) {
          void load();
        }
      });
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [generateState, load, loadProgress, shouldPoll]);

  const runStudyGeneration = useCallback(async () => {
    setGenerateState("running");
    setError(null);
    try {
      const latestProgress = progress ?? (await loadProgress());
      if (latestProgress?.extractionCompleteForExplore) {
        await runDeterministicCanonicalStudyFromClient({ caseId, studyRunId });
      } else if (intakeRunId) {
        await startIntakeStudy(intakeRunId, { processingMode: "pack_driven_v1" });
      } else {
        throw new Error("Complete document extraction before generating the canonical study.");
      }
      await loadProgress();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate canonical study.");
    } finally {
      setGenerateState("idle");
      setBuildModalOpen(false);
    }
  }, [caseId, intakeRunId, load, loadProgress, progress, studyRunId]);

  const openBuildFlow = useCallback(() => {
    if (experienceState === "failure") {
      void runStudyGeneration();
      return;
    }
    setBuildModalOpen(true);
  }, [experienceState, runStudyGeneration]);

  const formattedJson = useMemo(
    () => (artifact ? JSON.stringify(artifact, null, 2) : ""),
    [artifact],
  );

  const copyJson = useCallback(async () => {
    if (!formattedJson) {
      return;
    }
    try {
      await navigator.clipboard.writeText(formattedJson);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      setCopyState("failed");
    }
  }, [formattedJson]);

  const downloadHref = `/api/case/${encodeURIComponent(caseId)}/canonical-debug/download?studyRunId=${encodeURIComponent(studyRunId)}`;
  const documentsHref = buildCaseDocumentsHref({
    caseId,
    studyRunId,
    intakeRunId,
    audience: workspaceAudience,
  });
  const reportsHref = buildCaseReportsHref({
    caseId,
    studyRunId,
    intakeRunId,
    audience: workspaceAudience ?? "customer",
  });
  const studyMapHref = `/study/${encodeURIComponent(studyRunId)}/map`;
  const myCasesHref = buildMyCasesHref();

  const docCount = progress?.readDocumentCount ?? progress?.documents.length ?? 0;
  const failedDocumentCount =
    progress?.documents.filter((row) => row.uiStatus === "failed").length ?? 0;

  const buildDisabled =
    generateState === "running" || !canGenerate || studyProcessing;

  const debugJsonSection = formattedJson ? (
    <div className="space-y-3">
      <button
        type="button"
        className="text-sm font-medium text-customerHive-secondary"
        onClick={() => setShowJson((value) => !value)}
      >
        {showJson ? "Hide" : "Show"} canonical JSON (debug)
      </button>
      {showJson ? (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void copyJson()}
            className="rounded-lg border border-customerHive-border bg-white px-3 py-1.5 text-sm"
          >
            {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy"}
          </button>
          <a
            href={downloadHref}
            className="rounded-lg border border-customerHive-border bg-white px-3 py-1.5 text-sm"
          >
            Download
          </a>
        </div>
      ) : null}
      {showJson ? (
        <pre className="max-h-[50vh] overflow-auto rounded-xl border border-customerHive-border bg-customerHive-surface-lowest p-4 font-mono text-xs leading-relaxed">
          {formattedJson}
        </pre>
      ) : null}
    </div>
  ) : null;

  return (
    <HiveCustomerShell
      intakeRunId={intakeRunId}
      exploreDisabled={!progress?.extractionCompleteForExplore}
      workspace={{
        caseId,
        studyRunId,
        intakeRunId,
        caseLabel: progress?.subjectFirstName,
        activeSection: "canonical-study",
        audience: workspaceAudience,
      }}
    >
      <div className="mx-auto w-full min-w-0 max-w-[1160px] px-5 py-8 sm:px-8 sm:py-9 lg:px-8">
        <header className="mb-8 flex min-w-0 flex-col gap-1">
          <h1
            className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-customerHive-on-surface sm:text-[30px]"
            style={{ fontFamily: "var(--font-outfit), sans-serif" }}
          >
            Canonical Study
          </h1>
          <p className="text-[15px] text-customerHive-on-surface-variant">
            Connect validated findings across your documents, then create reports from the same study.
          </p>
        </header>

        <CanonicalStudyExperiencePanel
          state={experienceState}
          progress={progress}
          projection={projection}
          openAiOnly={openAiOnly}
          subjectFirstName={progress?.subjectFirstName}
          studyMapHref={studyMapHref}
          documentsHref={documentsHref}
          reportsHref={reportsHref}
          myCasesHref={myCasesHref}
          loadError={error}
          onBuildClick={openBuildFlow}
          buildDisabled={buildDisabled}
          showPreviousStudyNote={
            hasAcceptedStudyContent && experienceState === "processing"
          }
          debugJsonSection={debugJsonSection}
        />

        <CanonicalStudyBuildConfirmModal
          open={buildModalOpen}
          mode={hasAcceptedStudyContent ? "update" : "create"}
          documentCount={docCount}
          showFailedDocumentNotice={failedDocumentCount > 0}
          busy={generateState === "running"}
          onCancel={() => setBuildModalOpen(false)}
          onConfirm={() => void runStudyGeneration()}
        />
      </div>
    </HiveCustomerShell>
  );
}
