"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { projectCanonicalStudyTimeline } from "@hiveforyou/core";
import type {
  CanonicalStudyArtifact,
  CanonicalStudyProvenanceChip,
  CanonicalStudyTimelineEntry,
} from "@hiveforyou/shared/canonical-study-artifact";

type CanonicalStudyDebugArtifact = CanonicalStudyArtifact & {
  readerPack?: {
    packId: string;
    packVersion: string;
    packContentSha256: string;
    packPath: string;
    packSource: "snapshot" | "override" | "current";
  };
  canonicalRuleset?: {
    rulesetId: string;
    rulesetVersion: string;
    rulesetContentSha256: string;
  };
};

export function CanonicalStudyDebugView({
  caseId,
  initialStudyRunId,
}: {
  caseId: string;
  initialStudyRunId?: string;
}) {
  const [studyRunId, setStudyRunId] = useState(initialStudyRunId ?? "");
  const [artifact, setArtifact] = useState<CanonicalStudyDebugArtifact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [audience, setAudience] = useState<"customer" | "pro">("customer");

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
      const payload = (await response.json()) as CanonicalStudyDebugArtifact & {
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

  const projectedTimeline = useMemo(() => {
    if (!artifact?.timeline) {
      return null;
    }
    return projectCanonicalStudyTimeline(artifact, { audience });
  }, [artifact, audience]);

  const extractionDebugBase = `/hives/${encodeURIComponent(caseId)}/extraction-debug${
    studyRunId.trim() ? `?studyRunId=${encodeURIComponent(studyRunId.trim())}` : ""
  }`;

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
              <p className="text-xs uppercase tracking-wide text-[var(--hfy-quiet)]">Reader pack</p>
              <p className="text-sm">
                {artifact.readerPack
                  ? `${artifact.readerPack.packId} @ ${artifact.readerPack.packVersion} (${artifact.readerPack.packSource})`
                  : `${artifact.packId} @ ${artifact.packVersion}`}
              </p>
              {artifact.readerPack ? (
                <p className="font-mono text-xs break-all text-[var(--hfy-quiet)]">
                  {artifact.readerPack.packContentSha256}
                </p>
              ) : null}
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--hfy-quiet)]">Canonical ruleset</p>
              {artifact.canonicalRuleset ? (
                <>
                  <p className="text-sm">
                    {artifact.canonicalRuleset.rulesetId} @ {artifact.canonicalRuleset.rulesetVersion}
                  </p>
                  <p className="font-mono text-xs break-all text-[var(--hfy-quiet)]">
                    {artifact.canonicalRuleset.rulesetContentSha256}
                  </p>
                </>
              ) : (
                <p className="text-sm text-[var(--hfy-quiet)]">Not recorded on this artifact.</p>
              )}
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--hfy-quiet)]">Artifact SHA-256</p>
              <p className="font-mono text-xs break-all">{artifact.contentSha256}</p>
            </div>
          </section>

          {projectedTimeline ? (
            <section className="space-y-6 rounded-xl border border-[var(--hfy-line)] bg-[var(--hfy-surface)] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-[var(--hfy-text)]">Case timeline</h2>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`hfy-btn ${audience === "customer" ? "hfy-btn--primary" : ""}`}
                    onClick={() => setAudience("customer")}
                  >
                    Customer labels
                  </button>
                  <button
                    type="button"
                    className={`hfy-btn ${audience === "pro" ? "hfy-btn--primary" : ""}`}
                    onClick={() => setAudience("pro")}
                  >
                    Pro labels
                  </button>
                </div>
              </div>
              <TimelineSection
                title="Dated events"
                entries={projectedTimeline.dated}
                extractionDebugBase={extractionDebugBase}
              />
              <TimelineSection
                title="Date unknown"
                entries={projectedTimeline.dateUnknown}
                extractionDebugBase={extractionDebugBase}
              />
              <TimelineSection
                title="Incomplete extraction"
                entries={projectedTimeline.incomplete}
                extractionDebugBase={extractionDebugBase}
              />
              {projectedTimeline.relationships.length ? (
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Document relationships</h3>
                  <ul className="space-y-1 text-sm">
                    {projectedTimeline.relationships.map((rel) => (
                      <li key={rel.id} className="font-mono text-xs">
                        {rel.kind}: {rel.fromSourceDocumentId} → {rel.toSourceDocumentId}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}

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

function TimelineSection({
  title,
  entries,
  extractionDebugBase,
}: {
  title: string;
  entries: Array<CanonicalStudyTimelineEntry & { displayLabel?: string }>;
  extractionDebugBase: string;
}) {
  if (!entries.length) {
    return null;
  }
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <ul className="space-y-4">
        {entries.map((entry) => (
          <li key={entry.entryId} className="rounded-lg border border-[var(--hfy-line)] p-3 text-sm">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-medium">{entry.displayLabel ?? entry.label}</span>
              <span className="text-[var(--hfy-quiet)]">({entry.status})</span>
              {entry.sortDate ? <span className="font-mono text-xs">{entry.sortDate}</span> : null}
            </div>
            <p className="mt-1 text-xs text-[var(--hfy-quiet)]">
              {entry.dateKind} · {entry.eventId}
            </p>
            <EvidenceBlock label="Event evidence" chips={entry.eventEvidence} base={extractionDebugBase} />
            <EvidenceBlock label="Date evidence" chips={entry.dateEvidence} base={extractionDebugBase} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function EvidenceBlock({
  label,
  chips,
  base,
}: {
  label: string;
  chips: CanonicalStudyProvenanceChip[];
  base: string;
}) {
  if (!chips.length) {
    return (
      <p className="mt-2 text-xs text-[var(--hfy-quiet)]">
        {label}: none
      </p>
    );
  }
  return (
    <div className="mt-2">
      <p className="text-xs font-semibold">{label}</p>
      <ul className="mt-1 space-y-1">
        {chips.map((chip) => {
          const page = chip.evidence[0]?.page ?? 1;
          const quote = chip.evidence[0]?.quote ?? "";
          const href = `${base}&sourceDocumentId=${encodeURIComponent(chip.sourceDocumentId)}&page=${page}`;
          return (
            <li key={chip.fieldKey}>
              <a className="text-[var(--hfy-leaf-deep)] underline" href={href}>
                {chip.recordTypeId}.{chip.fieldId} p{page}
              </a>
              {quote ? (
                <span className="ml-2 text-[var(--hfy-quiet)]">&ldquo;{quote.slice(0, 80)}&rdquo;</span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
