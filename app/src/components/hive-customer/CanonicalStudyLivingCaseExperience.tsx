"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  CanonicalStudyReportAudience,
  CanonicalStudyReportProjection,
} from "@hiveforyou/shared/canonical-study-report-projection";
import type { HiveUiTree } from "@hiveforyou/shared/hive-ui-tree";

import { HiveUiRenderer } from "@/components/hive-ui/HiveUiRenderer";
import {
  buildHiveCanonicalJsonHref,
  buildHiveReportPreviewHref,
} from "@/lib/intake/study-completion-navigation";

import { HiveCustomerShell } from "./HiveCustomerShell";

type CanonicalStudyReportPayload = CanonicalStudyReportProjection & {
  hiveUiTree?: HiveUiTree | null;
};

type WriterUiTreePayload = {
  layout: "writer" | "deterministic_fallback";
  hiveUiTree: HiveUiTree | null;
  fallbackReason: {
    code: string;
    message: string;
    errorCodes: string[];
  } | null;
  shadowStatus: string;
  idempotencyKey: string;
  validation: { ok: boolean; errorCodes: string[]; message: string | null } | null;
};

type HiveWriterShadowDiagnostic = {
  writerRunId: string;
  status: string;
  idempotencyKey: string;
  validation: { ok: boolean; errorCodes: string[]; message: string | null };
  observability: { durationMs: number; modelIdentifier: string | null; projectionHash: string };
};

const WRITER_POLL_INTERVAL_MS = 2000;
const WRITER_POLL_TIMEOUT_MS = 180_000;

function isWriterInFlight(status: string): boolean {
  return status === "queued" || status === "processing";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function AudienceToggle({
  audience,
  caseId,
  studyRunId,
}: {
  audience: CanonicalStudyReportAudience;
  caseId: string;
  studyRunId: string;
}) {
  const base = { caseId, studyRunId };
  const customerHref = buildHiveReportPreviewHref({ ...base, audience: "customer" });
  const proHref = buildHiveReportPreviewHref({ ...base, audience: "pro" });

  return (
    <div className="hir-reports-seg" role="tablist" aria-label="Report audience">
      <Link
        href={customerHref}
        role="tab"
        aria-selected={audience === "customer"}
        className="hir-reports-seg__option"
      >
        Customer
      </Link>
      <Link
        href={proHref}
        role="tab"
        aria-selected={audience === "pro"}
        className="hir-reports-seg__option"
      >
        Pro
      </Link>
    </div>
  );
}

function InternalPreviewBanner({
  projection,
}: {
  projection: CanonicalStudyReportProjection;
}) {
  if (projection.presentationMode === "approved") {
    return null;
  }
  return (
    <div
      className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
      role="status"
      data-testid="canonical-report-internal-preview-banner"
    >
      <p className="font-semibold">Internal preview — not an approved customer report</p>
      <p className="mt-1">
        Pack approval: {projection.packApprovalLabel}. Customer/Pro reports permitted:{" "}
        {projection.customerProReportsPermitted ? "yes" : "no"}.
      </p>
    </div>
  );
}

export function CanonicalStudyLivingCaseExperience({
  caseId,
  studyRunId,
  initialAudience,
}: {
  caseId: string;
  studyRunId: string;
  initialAudience: CanonicalStudyReportAudience;
}) {
  const [audience, setAudience] = useState<CanonicalStudyReportAudience>(initialAudience);
  const [projection, setProjection] = useState<CanonicalStudyReportPayload | null>(null);
  const [deterministicHiveUiTree, setDeterministicHiveUiTree] = useState<HiveUiTree | null>(null);
  const [writerPreview, setWriterPreview] = useState<WriterUiTreePayload | null>(null);
  const [writerPreviewLoading, setWriterPreviewLoading] = useState(false);
  const [generation, setGeneration] = useState<HiveWriterShadowDiagnostic | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const requestSerial = useRef(0);
  const generatingRef = useRef(false);

  useEffect(() => {
    setAudience(initialAudience);
  }, [initialAudience]);

  useEffect(() => {
    requestSerial.current += 1;
    setWriterPreview(null);
    setGeneration(null);
  }, [audience, studyRunId]);

  const loadReport = useCallback(async () => {
    if (!studyRunId.trim()) {
      setError("studyRunId is required.");
      setProjection(null);
      setDeterministicHiveUiTree(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/case/${encodeURIComponent(caseId)}/canonical-report?studyRunId=${encodeURIComponent(studyRunId)}&audience=${encodeURIComponent(audience)}`,
      );
      const payload = (await response.json()) as CanonicalStudyReportPayload & {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        setProjection(null);
        setDeterministicHiveUiTree(null);
        setError(payload.message ?? payload.error ?? "Could not load report.");
        return;
      }
      setProjection(payload);
      setDeterministicHiveUiTree(payload.hiveUiTree ?? null);
    } catch {
      setProjection(null);
      setDeterministicHiveUiTree(null);
      setError("Network error while loading report.");
    } finally {
      setLoading(false);
    }
  }, [audience, caseId, studyRunId]);

  const loadWriterPreview = useCallback(async () => {
    if (!studyRunId.trim()) {
      return;
    }
    setWriterPreviewLoading(true);
    try {
      const response = await fetch(
        `/api/case/${encodeURIComponent(caseId)}/hive-writer-shadow/ui-tree?studyRunId=${encodeURIComponent(studyRunId)}&audience=${encodeURIComponent(audience)}`,
      );
      const payload = (await response.json()) as WriterUiTreePayload & {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        setWriterPreview(null);
        return;
      }
      setWriterPreview(payload);
    } catch {
      setWriterPreview(null);
    } finally {
      setWriterPreviewLoading(false);
    }
  }, [audience, caseId, studyRunId]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  useEffect(() => {
    void loadWriterPreview();
  }, [loadWriterPreview]);

  const pollWriterStatus = useCallback(
    async (serial: number, writerRunId: string): Promise<HiveWriterShadowDiagnostic | null> => {
      const deadline = Date.now() + WRITER_POLL_TIMEOUT_MS;
      while (Date.now() < deadline) {
        if (requestSerial.current !== serial) {
          return null;
        }
        const response = await fetch(
          `/api/case/${encodeURIComponent(caseId)}/hive-writer-shadow/status?studyRunId=${encodeURIComponent(studyRunId)}&audience=${encodeURIComponent(audience)}&writerRunId=${encodeURIComponent(writerRunId)}`,
        );
        const payload = (await response.json()) as HiveWriterShadowDiagnostic & {
          error?: string;
          message?: string;
        };
        if (!response.ok) {
          throw new Error(payload.message ?? payload.error ?? "Writer status failed.");
        }
        if (!isWriterInFlight(payload.status)) {
          return payload;
        }
        setGeneration(payload);
        await sleep(WRITER_POLL_INTERVAL_MS);
      }
      return null;
    },
    [audience, caseId, studyRunId],
  );

  const generateCanonicalReport = useCallback(async () => {
    if (!studyRunId.trim() || generating || generatingRef.current) {
      return;
    }
    generatingRef.current = true;
    const serial = requestSerial.current + 1;
    requestSerial.current = serial;
    setGenerating(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/case/${encodeURIComponent(caseId)}/hive-writer-shadow/run`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studyRunId, audience }),
        },
      );
      const payload = (await response.json()) as HiveWriterShadowDiagnostic & {
        error?: string;
        message?: string;
      };
      if (requestSerial.current !== serial) {
        return;
      }
      if (!response.ok) {
        setError(payload.message ?? payload.error ?? "Report generation failed.");
        return;
      }
      setGeneration(payload);
      let terminal = payload;
      if (isWriterInFlight(payload.status)) {
        const polled = await pollWriterStatus(serial, payload.writerRunId);
        if (requestSerial.current !== serial) {
          return;
        }
        if (!polled) {
          setError("Report generation is still running. Refresh shortly.");
          return;
        }
        terminal = polled;
        setGeneration(polled);
      }
      if (
        terminal.status === "accepted" ||
        terminal.status === "rejected" ||
        terminal.status === "failed" ||
        terminal.status === "skipped" ||
        terminal.status === "unavailable"
      ) {
        await loadWriterPreview();
      }
      if (terminal.status === "rejected" || terminal.status === "failed") {
        setError(terminal.validation.message ?? "Report generation did not succeed. You can try again.");
      }
    } catch {
      if (requestSerial.current === serial) {
        setError("Network error while generating report.");
      }
    } finally {
      generatingRef.current = false;
      setGenerating(false);
    }
  }, [audience, caseId, generating, loadWriterPreview, pollWriterStatus, studyRunId]);

  const jsonHref = useMemo(
    () => buildHiveCanonicalJsonHref({ caseId, studyRunId }),
    [caseId, studyRunId],
  );

  const activeTree = useMemo(() => {
    if (writerPreview?.layout === "writer" && writerPreview.hiveUiTree) {
      return writerPreview.hiveUiTree;
    }
    return deterministicHiveUiTree;
  }, [deterministicHiveUiTree, writerPreview]);

  const writerRunId = generation?.writerRunId ?? null;
  const inflight = isWriterInFlight(generation?.status ?? writerPreview?.shadowStatus ?? "");

  const generateLabel =
    audience === "pro" ? "Generate Pro report" : "Generate Canonical Report";

  return (
    <HiveCustomerShell
      exploreDisabled={false}
      workspace={{
        caseId,
        studyRunId,
        audience,
        activeSection: "reports",
      }}
    >
      <div className="mx-auto w-full max-w-[1160px] px-4 py-8 md:px-8 md:py-10">
        <header className="mb-6 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <AudienceToggle audience={audience} caseId={caseId} studyRunId={studyRunId} />
            <button
              type="button"
              className="hir-btn-primary"
              disabled={generating || !studyRunId.trim()}
              onClick={() => void generateCanonicalReport()}
              data-testid="generate-canonical-report"
            >
              {generating
                ? generation?.status === "queued"
                  ? "Report queued…"
                  : generation?.status === "processing"
                    ? "Report processing…"
                    : "Generating report…"
                : generateLabel}
            </button>
            <Link href={jsonHref} className="hir-btn-secondary">
              Canonical JSON
            </Link>
          </div>
          {writerRunId ? (
            <p className="m-0 font-mono text-xs text-customerHive-on-surface-muted">
              studyRunId={studyRunId} · writerRunId={writerRunId}
            </p>
          ) : (
            <p className="m-0 font-mono text-xs text-customerHive-on-surface-muted">
              studyRunId={studyRunId || "—"}
            </p>
          )}
        </header>

        {loading ? (
          <p className="text-sm text-customerHive-on-surface-muted" role="status">
            Loading report…
          </p>
        ) : null}
        {writerPreviewLoading && !activeTree ? (
          <p className="mb-2 text-sm text-customerHive-on-surface-muted" role="status">
            Loading saved report layout…
          </p>
        ) : null}
        {inflight ? (
          <p className="mb-4 text-sm text-customerHive-on-surface-muted" data-testid="writer-layout-inflight">
            Report generation in progress…
          </p>
        ) : null}
        {error ? (
          <p className="mb-4 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        {projection ? (
          <>
            <InternalPreviewBanner projection={projection} />
            {activeTree ? (
              <HiveUiRenderer
                projection={projection}
                tree={activeTree}
                studyRunId={studyRunId}
                presentation={audience === "customer" ? "living-case" : "legacy"}
              />
            ) : (
              <div
                className="rounded-2xl border border-[var(--hir-border)] bg-white px-6 py-10 md:px-10"
                data-testid="living-case-empty"
              >
                <h2 className="m-0 font-[family-name:var(--font-outfit)] text-2xl font-semibold text-customerHive-on-surface">
                  {audience === "pro"
                    ? "No Pro report for this study yet"
                    : "No Canonical Report for this study yet"}
                </h2>
                <p className="mt-2 max-w-xl text-base text-customerHive-on-surface-variant">
                  Generate a report when you are ready. Refreshing this page will not start a new
                  run unless you choose Generate again.
                </p>
                <button
                  type="button"
                  className="hir-btn-primary mt-6"
                  disabled={generating || !studyRunId.trim()}
                  onClick={() => void generateCanonicalReport()}
                >
                  {generateLabel}
                </button>
              </div>
            )}
          </>
        ) : null}
      </div>
    </HiveCustomerShell>
  );
}

/** @deprecated Use CanonicalStudyLivingCaseExperience */
export const CanonicalStudyReportPreviewExperience = CanonicalStudyLivingCaseExperience;
