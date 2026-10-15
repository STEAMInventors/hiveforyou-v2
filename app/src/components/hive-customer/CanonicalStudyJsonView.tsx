"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { CanonicalStudyArtifact } from "@hiveforyou/shared/canonical-study-artifact";
import { buildHiveReadyHref } from "@/lib/intake/study-completion-navigation";

import { HiveCustomerShell } from "./HiveCustomerShell";

type CanonicalStudyDebugArtifact = CanonicalStudyArtifact & {
  readerPack?: unknown;
  canonicalRuleset?: unknown;
};

export function CanonicalStudyJsonView({
  caseId,
  studyRunId,
  intakeRunId,
}: {
  caseId: string;
  studyRunId: string;
  intakeRunId?: string | null;
}) {
  const [artifact, setArtifact] = useState<CanonicalStudyDebugArtifact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/case/${encodeURIComponent(caseId)}/canonical-debug?studyRunId=${encodeURIComponent(studyRunId)}`,
      );
      const payload = (await response.json()) as CanonicalStudyDebugArtifact & {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        setArtifact(null);
        setError(payload.message ?? payload.error ?? "Could not load canonical study JSON.");
        return;
      }
      setArtifact(payload);
    } catch {
      setArtifact(null);
      setError("Network error while loading canonical study JSON.");
    } finally {
      setLoading(false);
    }
  }, [caseId, studyRunId]);

  useEffect(() => {
    void load();
  }, [load]);

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

  return (
    <HiveCustomerShell intakeRunId={intakeRunId} exploreDisabled={false}>
      <div className="mx-auto w-full max-w-[1200px] px-6 py-10 lg:px-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-customerHive-on-surface">Canonical study JSON</h1>
            <p className="mt-1 font-mono text-xs text-customerHive-on-surface-muted">
              studyRunId={studyRunId}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void copyJson()}
              disabled={!formattedJson}
              className="rounded-lg border border-customerHive-border bg-white px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy"}
            </button>
            <a
              href={downloadHref}
              className="rounded-lg border border-customerHive-border bg-white px-4 py-2 text-sm font-medium"
            >
              Download
            </a>
            <Link
              href={backHref}
              className="rounded-lg bg-customerHive-primary px-4 py-2 text-sm font-medium text-white"
            >
              Back
            </Link>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-customerHive-on-surface-muted">Loading JSON…</p>
        ) : null}
        {error ? (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        {formattedJson ? (
          <pre className="max-h-[70vh] overflow-auto rounded-xl border border-customerHive-border bg-customerHive-surface-lowest p-4 font-mono text-xs leading-relaxed">
            {formattedJson}
          </pre>
        ) : null}
      </div>
    </HiveCustomerShell>
  );
}
