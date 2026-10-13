"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import type { CanonicalStudyArtifact } from "@hiveforyou/shared/canonical-study-artifact";

export function CanonicalStudyDebugView({
  caseId,
  initialStudyRunId,
}: {
  caseId: string;
  initialStudyRunId?: string;
}) {
  const [studyRunId, setStudyRunId] = useState(initialStudyRunId ?? "");
  const [artifact, setArtifact] = useState<CanonicalStudyArtifact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const load = useCallback(async () => {
    const trimmed = studyRunId.trim();
    if (!trimmed) {
      setError("Enter a study run ID.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/case/${encodeURIComponent(caseId)}/canonical-debug?studyRunId=${encodeURIComponent(trimmed)}`,
      );
      const payload = (await response.json()) as CanonicalStudyArtifact & {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        setArtifact(null);
        setError(payload.message ?? payload.error ?? "Could not load canonical study artifact.");
        return;
      }
      setArtifact(payload);
    } catch {
      setArtifact(null);
      setError("Network error while loading canonical study artifact.");
    } finally {
      setLoading(false);
    }
  }, [caseId, studyRunId]);

  useEffect(() => {
    if (initialStudyRunId?.trim()) {
      void load();
    }
  }, [initialStudyRunId, load]);

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

  const downloadHref =
    studyRunId.trim()
      ? `/api/case/${encodeURIComponent(caseId)}/canonical-debug/download?studyRunId=${encodeURIComponent(studyRunId.trim())}`
      : undefined;

  const backHref = `/hives/${encodeURIComponent(caseId)}/extraction-debug${
    studyRunId.trim() ? `?studyRunId=${encodeURIComponent(studyRunId.trim())}` : ""
  }`;

  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-[var(--hfy-line)] bg-[var(--hfy-leaf-wash)] px-4 py-3 text-sm text-[var(--hfy-leaf-deep)]">
        <strong>Deterministic canonical study (temporary debug).</strong> This JSON is produced by
        code-only foundation + canonical study builders. It is separate from legacy OpenAI case
        intelligence and raw Reader extraction.
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--hfy-text)]">Study run ID</span>
          <input
            className="hfy-input w-full"
            value={studyRunId}
            onChange={(event) => setStudyRunId(event.target.value)}
            placeholder="UUID for pack_driven_v1 study run"
          />
        </label>
        <button type="button" className="hfy-btn hfy-btn--primary" disabled={loading} onClick={() => void load()}>
          {loading ? "Loading…" : "Load canonical JSON"}
        </button>
      </div>

      {error ? (
        <p className="text-sm text-[var(--hfy-coral-deep)]" role="alert">
          {error}
        </p>
      ) : null}

      {artifact ? (
        <>
          <section className="grid gap-4 rounded-xl border border-[var(--hfy-line)] bg-[var(--hfy-surface)] p-5 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--hfy-quiet)]">Study run</p>
              <p className="font-mono text-sm break-all">{artifact.studyRunId}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--hfy-quiet)]">Attempt</p>
              <p className="font-mono text-sm break-all">{artifact.attemptId}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--hfy-quiet)]">Domain pack</p>
              <p className="text-sm">
                {artifact.packId} @ {artifact.packVersion}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--hfy-quiet)]">Content SHA-256</p>
              <p className="font-mono text-xs break-all">{artifact.contentSha256}</p>
            </div>
          </section>

          <div className="flex flex-wrap gap-3">
            <button type="button" className="hfy-btn" onClick={() => void copyJson()}>
              {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy JSON"}
            </button>
            {downloadHref ? (
              <a className="hfy-btn" href={downloadHref}>
                Download JSON
              </a>
            ) : null}
            <Link className="hfy-btn hfy-btn--quiet" href={backHref}>
              Back
            </Link>
          </div>

          <pre className="max-h-[70vh] overflow-auto rounded-xl border border-[var(--hfy-line)] bg-[var(--hfy-surface)] p-4 text-xs leading-relaxed text-[var(--hfy-graphite)] whitespace-pre-wrap break-words">
            {formattedJson}
          </pre>
        </>
      ) : null}
    </div>
  );
}
