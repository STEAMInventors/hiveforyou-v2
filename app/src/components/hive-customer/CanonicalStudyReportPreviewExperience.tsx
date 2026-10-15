"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  CanonicalStudyReportAudience,
  CanonicalStudyReportProjection,
} from "@hiveforyou/shared/canonical-study-report-projection";

import {
  buildHiveCanonicalJsonHref,
  buildHiveReportPreviewHref,
} from "@/lib/intake/study-completion-navigation";

import { CanonicalStudyCustomerReportView } from "./CanonicalStudyCustomerReportView";
import { CanonicalStudyProReportView } from "./CanonicalStudyProReportView";
import { HiveCustomerShell } from "./HiveCustomerShell";

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
  const [projection, setProjection] = useState<CanonicalStudyReportProjection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setAudience(initialAudience);
  }, [initialAudience]);

  const load = useCallback(async () => {
    if (!studyRunId.trim()) {
      setError("studyRunId is required.");
      setProjection(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/case/${encodeURIComponent(caseId)}/canonical-report?studyRunId=${encodeURIComponent(studyRunId)}&audience=${encodeURIComponent(audience)}`,
      );
      const payload = (await response.json()) as CanonicalStudyReportProjection & {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        setProjection(null);
        setError(payload.message ?? payload.error ?? "Could not load report preview.");
        return;
      }
      setProjection(payload);
    } catch {
      setProjection(null);
      setError("Network error while loading report preview.");
    } finally {
      setLoading(false);
    }
  }, [audience, caseId, studyRunId]);

  useEffect(() => {
    void load();
  }, [load]);

  const jsonHref = useMemo(
    () => buildHiveCanonicalJsonHref({ caseId, studyRunId }),
    [caseId, studyRunId],
  );

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
        {error ? (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        {projection ? (
          <>
            <InternalPreviewBanner projection={projection} />
            {projection.audience === "customer" ? (
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
