"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { CanonicalStudyReportProjection } from "@hiveforyou/shared/canonical-study-report-projection";
import { isStudyRunProcessing } from "@hiveforyou/shared/canonical-study";
import type { CanonicalStudyArtifact } from "@hiveforyou/shared/canonical-study-artifact";
import type { HiveUiTree } from "@hiveforyou/shared/hive-ui-tree";

import { HiveUiRenderer } from "@/components/hive-ui/HiveUiRenderer";
import { fetchHiveExtractionProgress } from "@/lib/hive-customer/hive-extraction-progress-client";
import type { HiveExtractionProgressView } from "@/lib/hive-customer/hive-extraction-progress-types";
import { runDeterministicCanonicalStudyFromClient } from "@/lib/hive-customer/run-deterministic-canonical-study-client";
import { startIntakeStudy } from "@/lib/intake/intake-client";
import {
  buildCaseReportsHref,
  buildHiveReadyHref,
  buildHiveReportPreviewHref,
  isCanonicalStudyPresentationReady,
} from "@/lib/intake/study-completion-navigation";

import { CanonicalStudyCustomerReportView } from "./CanonicalStudyCustomerReportView";
import { HiveCustomerShell } from "./HiveCustomerShell";

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

  const generateStudy = useCallback(async () => {
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
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate canonical study.");
    } finally {
      setGenerateState("idle");
    }
  }, [caseId, intakeRunId, load, loadProgress, progress, studyRunId]);

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
  const backHref = buildHiveReadyHref({ caseId, studyRunId });
  const reportPreviewHref = buildHiveReportPreviewHref({
    caseId,
    studyRunId,
    audience: workspaceAudience ?? "customer",
  });
  const reportsHref = buildCaseReportsHref({
    caseId,
    studyRunId,
    intakeRunId,
    audience: workspaceAudience ?? "customer",
  });
  const studyProcessing =
    progress != null && isStudyRunProcessing(progress.studyRunStatus);
  const canGenerate =
    progress?.extractionCompleteForExplore === true || Boolean(intakeRunId);
  const openAiOnly =
    !projection &&
    !artifact &&
    progress != null &&
    isCanonicalStudyPresentationReady(progress.studyRunStatus);

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
      <div className="mx-auto w-full max-w-[1200px] px-6 py-10 lg:px-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-customerHive-on-surface">Canonical study</h1>
            <p className="mt-1 font-mono text-xs text-customerHive-on-surface-muted">
              studyRunId={studyRunId}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              data-testid="generate-canonical-study"
              disabled={generateState === "running" || !canGenerate || studyProcessing}
              onClick={() => void generateStudy()}
              className="rounded-lg bg-customerHive-primary px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {generateState === "running"
                ? "Generating study…"
                : projection || artifact
                  ? "Regenerate study"
                  : "Generate study"}
            </button>
            {projection ? (
              <Link
                href={reportPreviewHref}
                className="rounded-lg border border-customerHive-border bg-white px-4 py-2 text-sm font-medium"
              >
                Generate report
              </Link>
            ) : null}
            <Link
              href={reportsHref}
              className="rounded-lg border border-customerHive-border bg-white px-4 py-2 text-sm font-medium"
            >
              Reports
            </Link>
            <Link
              href={backHref}
              className="rounded-lg border border-customerHive-border bg-white px-4 py-2 text-sm font-medium"
            >
              Documents
            </Link>
          </div>
        </div>

        {studyProcessing ? (
          <p className="mb-4 text-sm text-customerHive-on-surface-muted" role="status">
            Study run is still processing ({progress?.studyRunStatus}).
          </p>
        ) : null}

        {loading ? (
          <p className="text-sm text-customerHive-on-surface-muted">Loading canonical study…</p>
        ) : null}
        {error ? (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}

        {openAiOnly ? (
          <div className="mb-6 rounded-xl border border-customerHive-border bg-customerHive-surface-low px-6 py-8">
            <p className="text-sm text-customerHive-on-surface-variant">
              OpenAI canonical study is ready. Use the study map for validated findings.
            </p>
            <Link
              href={`/study/${encodeURIComponent(studyRunId)}/map`}
              className="mt-4 inline-flex rounded-lg bg-customerHive-primary px-4 py-2 text-sm font-medium text-white"
            >
              Open study map
            </Link>
          </div>
        ) : null}

        {!loading && !projection && !artifact && !openAiOnly ? (
          <div
            className="mb-6 rounded-xl border border-dashed border-customerHive-border px-6 py-8 text-center"
            data-testid="canonical-study-empty"
          >
            <p className="text-sm text-customerHive-on-surface-variant">
              Generate study to build validated case understanding from extracted documents.
            </p>
          </div>
        ) : null}

        {projection ? (
          <div className="mb-8 space-y-6" data-testid="canonical-study-ready">
            {projection.hiveUiTree ? (
              <HiveUiRenderer projection={projection} tree={projection.hiveUiTree} />
            ) : projection.audience === "customer" ? (
              <CanonicalStudyCustomerReportView body={projection.body} />
            ) : null}
          </div>
        ) : null}

        {formattedJson ? (
          <div className="space-y-3">
            <button
              type="button"
              className="text-sm font-medium text-customerHive-primary"
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
                  {copyState === "copied" ? "Copied" : "Copy"}
                </button>
                <a href={downloadHref} className="rounded-lg border border-customerHive-border bg-white px-3 py-1.5 text-sm">
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
        ) : null}
      </div>
    </HiveCustomerShell>
  );
}
