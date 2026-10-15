"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

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

import { CanonicalStudyCustomerReportView } from "./CanonicalStudyCustomerReportView";
import { CanonicalStudyProReportView } from "./CanonicalStudyProReportView";
import { HiveCustomerShell } from "./HiveCustomerShell";

type ReportLayoutMode = "deterministic" | "writer";

type CanonicalStudyReportPreviewPayload = CanonicalStudyReportProjection & {
  hiveUiTree?: HiveUiTree | null;
};

type WriterUiTreePreviewPayload = {
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
  writerShadowEnabled: boolean;
};

type HiveWriterShadowDiagnostic = {
  status: string;
  idempotencyKey: string;
  validation: { ok: boolean; errorCodes: string[]; message: string | null };
  observability: { durationMs: number; modelIdentifier: string | null; projectionHash: string };
};

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
    <div
      className="inline-flex rounded-lg border border-customerHive-border bg-white p-1"
      role="tablist"
      aria-label="Report audience"
    >
      <Link
        href={customerHref}
        role="tab"
        aria-selected={audience === "customer"}
        className={`rounded-md px-4 py-2 text-sm font-medium ${
          audience === "customer"
            ? "bg-customerHive-primary text-white"
            : "text-customerHive-on-surface"
        }`}
      >
        Customer
      </Link>
      <Link
        href={proHref}
        role="tab"
        aria-selected={audience === "pro"}
        className={`rounded-md px-4 py-2 text-sm font-medium ${
          audience === "pro" ? "bg-customerHive-primary text-white" : "text-customerHive-on-surface"
        }`}
      >
        Pro
      </Link>
    </div>
  );
}

function LayoutToggle({
  layoutMode,
  onChange,
}: {
  layoutMode: ReportLayoutMode;
  onChange: (mode: ReportLayoutMode) => void;
}) {
  return (
    <div
      className="inline-flex rounded-lg border border-customerHive-border bg-white p-1"
      role="tablist"
      aria-label="Report layout source"
    >
      <button
        type="button"
        role="tab"
        aria-selected={layoutMode === "deterministic"}
        className={`rounded-md px-4 py-2 text-sm font-medium ${
          layoutMode === "deterministic"
            ? "bg-customerHive-primary text-white"
            : "text-customerHive-on-surface"
        }`}
        onClick={() => onChange("deterministic")}
      >
        Deterministic
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={layoutMode === "writer"}
        className={`rounded-md px-4 py-2 text-sm font-medium ${
          layoutMode === "writer"
            ? "bg-customerHive-primary text-white"
            : "text-customerHive-on-surface"
        }`}
        onClick={() => onChange("writer")}
      >
        Writer
      </button>
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
      <p className="mt-1 font-medium">Layout comparison is internal-only. Writer output is never published here.</p>
    </div>
  );
}

function WriterFallbackBanner({ message }: { message: string }) {
  return (
    <div
      className="mb-4 rounded-xl border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-950"
      role="status"
      data-testid="writer-layout-fallback-banner"
    >
      <p className="font-semibold">Showing deterministic layout (Writer fallback)</p>
      <p className="mt-1">{message}</p>
    </div>
  );
}

function WriterStatusPanel({
  writerPreview,
  generation,
}: {
  writerPreview: WriterUiTreePreviewPayload | null;
  generation: HiveWriterShadowDiagnostic | null;
}) {
  const status = generation?.status ?? writerPreview?.shadowStatus ?? "—";
  const validation = generation?.validation ?? writerPreview?.validation;
  return (
    <div
      className="mb-4 rounded-xl border border-customerHive-border bg-white px-4 py-3 text-sm"
      data-testid="writer-layout-status"
    >
      <p className="font-medium text-customerHive-on-surface">Writer layout status</p>
      <p className="mt-1 text-customerHive-on-surface-muted">
        Shadow status: <span className="font-mono">{status}</span>
        {writerPreview?.idempotencyKey ? (
          <>
            {" "}
            · idempotency{" "}
            <span className="font-mono text-xs">{writerPreview.idempotencyKey.slice(0, 12)}…</span>
          </>
        ) : null}
      </p>
      {validation ? (
        <p className="mt-1 text-customerHive-on-surface-muted">
          Validation: {validation.ok ? "ok" : "failed"}
          {!validation.ok && validation.errorCodes.length > 0 ? (
            <> ({validation.errorCodes.join(", ")})</>
          ) : null}
          {validation.message ? <> — {validation.message}</> : null}
        </p>
      ) : null}
      {generation?.observability.modelIdentifier ? (
        <p className="mt-1 font-mono text-xs text-customerHive-on-surface-muted">
          model={generation.observability.modelIdentifier} ·{" "}
          {generation.observability.durationMs}ms
        </p>
      ) : null}
    </div>
  );
}

export function CanonicalStudyReportPreviewExperience({
  caseId,
  studyRunId,
  initialAudience,
}: {
  caseId: string;
  studyRunId: string;
  initialAudience: CanonicalStudyReportAudience;
}) {
  const [audience, setAudience] = useState<CanonicalStudyReportAudience>(initialAudience);
  const [layoutMode, setLayoutMode] = useState<ReportLayoutMode>("deterministic");
  const [projection, setProjection] = useState<CanonicalStudyReportPreviewPayload | null>(null);
  const [deterministicHiveUiTree, setDeterministicHiveUiTree] = useState<HiveUiTree | null>(null);
  const [writerPreview, setWriterPreview] = useState<WriterUiTreePreviewPayload | null>(null);
  const [writerPreviewLoading, setWriterPreviewLoading] = useState(false);
  const [generation, setGeneration] = useState<HiveWriterShadowDiagnostic | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setAudience(initialAudience);
  }, [initialAudience]);

  useEffect(() => {
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
      const payload = (await response.json()) as CanonicalStudyReportPreviewPayload & {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        setProjection(null);
        setDeterministicHiveUiTree(null);
        setError(payload.message ?? payload.error ?? "Could not load report preview.");
        return;
      }
      setProjection(payload);
      setDeterministicHiveUiTree(payload.hiveUiTree ?? null);
    } catch {
      setProjection(null);
      setDeterministicHiveUiTree(null);
      setError("Network error while loading report preview.");
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
      const payload = (await response.json()) as WriterUiTreePreviewPayload & {
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
    if (layoutMode !== "writer") {
      return;
    }
    void loadWriterPreview();
  }, [layoutMode, loadWriterPreview]);

  const generateWriterLayout = useCallback(async () => {
    if (!studyRunId.trim() || generating) {
      return;
    }
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
      if (!response.ok) {
        setError(payload.message ?? payload.error ?? "Writer generation failed.");
        return;
      }
      setGeneration(payload);
      setLayoutMode("writer");
      await loadWriterPreview();
    } catch {
      setError("Network error while generating Writer layout.");
    } finally {
      setGenerating(false);
    }
  }, [audience, caseId, generating, loadWriterPreview, studyRunId]);

  const jsonHref = useMemo(
    () => buildHiveCanonicalJsonHref({ caseId, studyRunId }),
    [caseId, studyRunId],
  );

  const activeTree = useMemo(() => {
    if (layoutMode === "deterministic") {
      return deterministicHiveUiTree;
    }
    if (writerPreview?.layout === "writer" && writerPreview.hiveUiTree) {
      return writerPreview.hiveUiTree;
    }
    return deterministicHiveUiTree;
  }, [deterministicHiveUiTree, layoutMode, writerPreview]);

  const showWriterFallback =
    layoutMode === "writer" &&
    writerPreview != null &&
    writerPreview.layout === "deterministic_fallback";

  return (
    <HiveCustomerShell exploreDisabled={false}>
      <div className="mx-auto w-full max-w-[1200px] px-6 py-10 lg:px-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-customerHive-on-surface">
              {audience === "pro" ? "Pro report preview" : "Customer report preview"}
            </h1>
            <p className="mt-1 font-mono text-xs text-customerHive-on-surface-muted">
              studyRunId={studyRunId || "—"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <AudienceToggle audience={audience} caseId={caseId} studyRunId={studyRunId} />
            <LayoutToggle layoutMode={layoutMode} onChange={setLayoutMode} />
            <button
              type="button"
              className="rounded-lg border border-customerHive-border bg-white px-4 py-2 text-sm font-medium disabled:opacity-50"
              disabled={generating || !studyRunId.trim()}
              onClick={() => void generateWriterLayout()}
              data-testid="generate-writer-layout"
            >
              {generating ? "Generating Writer layout…" : "Generate Writer layout"}
            </button>
            <Link
              href={jsonHref}
              className="rounded-lg border border-customerHive-border bg-white px-4 py-2 text-sm font-medium"
            >
              Canonical JSON
            </Link>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-customerHive-on-surface-muted">Loading report preview…</p>
        ) : null}
        {writerPreviewLoading && layoutMode === "writer" ? (
          <p className="mb-2 text-sm text-customerHive-on-surface-muted">Loading Writer layout…</p>
        ) : null}
        {error ? (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        {projection ? (
          <>
            <InternalPreviewBanner projection={projection} />
            {layoutMode === "writer" ? (
              <WriterStatusPanel writerPreview={writerPreview} generation={generation} />
            ) : null}
            {showWriterFallback && writerPreview?.fallbackReason ? (
              <WriterFallbackBanner message={writerPreview.fallbackReason.message} />
            ) : null}
            {activeTree ? (
              <HiveUiRenderer projection={projection} tree={activeTree} />
            ) : projection.audience === "customer" ? (
              <CanonicalStudyCustomerReportView body={projection.body} />
            ) : (
              <CanonicalStudyProReportView
                body={projection.body}
                studyRunId={studyRunId}
                exportPermitted={projection.presentationMode === "approved"}
              />
            )}
          </>
        ) : null}
      </div>
    </HiveCustomerShell>
  );
}
