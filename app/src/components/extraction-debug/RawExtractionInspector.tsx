"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { RawExtractionInspectorBundle } from "@hiveforyou/core";

type InspectorBundle = RawExtractionInspectorBundle & { intakeRunId?: string | null };

const DEFAULT_STATUS_STYLE = { bg: "var(--hfy-mist)", color: "var(--hfy-graphite)" };

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  SUCCEEDED: { bg: "var(--hfy-leaf-wash)", color: "var(--hfy-leaf-deep)" },
  INVALID_JSON: { bg: "var(--hfy-honey-wash)", color: "var(--hfy-honey-deep)" },
  MODEL_ERROR: { bg: "var(--hfy-coral-wash)", color: "var(--hfy-coral-deep)" },
  MISSING_OUTPUT: DEFAULT_STATUS_STYLE,
};

function statusStyle(status: string): { bg: string; color: string } {
  return STATUS_STYLES[status] ?? DEFAULT_STATUS_STYLE;
}

function StatusBadge({ status }: { status: string }) {
  const style = statusStyle(status);
  return (
    <span
      className="hfy-badge"
      style={{
        background: style.bg,
        color: style.color,
        fontWeight: 600,
        fontSize: 12,
        letterSpacing: "0.02em",
      }}
    >
      {status}
    </span>
  );
}

function EnvelopeProvenance({
  envelope,
}: {
  envelope: NonNullable<InspectorBundle["documents"][number]["envelope"]> | null;
}) {
  if (!envelope) {
    return <p className="text-xs text-[var(--hfy-quiet)]">No persisted envelope for this document.</p>;
  }

  const rows: Array<{ label: string; value: string }> = [
    { label: "Persistence status", value: envelope.status },
    { label: "Model", value: `${envelope.modelProvider} / ${envelope.modelId}` },
    {
      label: "Domain pack",
      value: `${envelope.packId} @ ${envelope.packVersion}`,
    },
    { label: "Prompt version", value: envelope.promptVersion ?? "—" },
    { label: "Occurred at", value: envelope.occurredAt },
    {
      label: "Latency",
      value: envelope.latencyMs != null ? `${envelope.latencyMs} ms` : "—",
    },
    {
      label: "Pack content SHA-256",
      value: envelope.packContentSha256 ?? "—",
    },
  ];

  return (
    <dl className="grid gap-2 text-sm sm:grid-cols-2">
      {rows.map((row) => (
        <Fragment key={row.label}>
          <dt className="text-xs uppercase tracking-wide text-[var(--hfy-quiet)]">{row.label}</dt>
          <dd className="font-mono text-xs break-all text-[var(--hfy-graphite)]">{row.value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

function JsonBlock({ value, label }: { value: unknown; label: string }) {
  const text = useMemo(() => {
    if (value === undefined || value === null) {
      return "";
    }
    if (typeof value === "string") {
      return value;
    }
    return JSON.stringify(value, null, 2);
  }, [value]);

  return (
    <details className="rounded-lg border border-[var(--hfy-line)] bg-[var(--hfy-surface)]">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--hfy-text)]">
        {label}
      </summary>
      <pre className="max-h-[28rem] overflow-auto border-t border-[var(--hfy-line)] px-4 py-3 text-xs leading-relaxed text-[var(--hfy-graphite)] whitespace-pre-wrap break-words">
        {text || "(empty)"}
      </pre>
    </details>
  );
}

export function RawExtractionInspector({
  caseId,
  initialStudyRunId,
}: {
  caseId: string;
  initialStudyRunId?: string;
}) {
  const [studyRunId, setStudyRunId] = useState(initialStudyRunId ?? "");
  const [bundle, setBundle] = useState<InspectorBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [runState, setRunState] = useState<"idle" | "confirming" | "running">("idle");
  const [canonicalRunState, setCanonicalRunState] = useState<"idle" | "running">("idle");
  const router = useRouter();

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
        `/api/case/${encodeURIComponent(caseId)}/raw-extraction?studyRunId=${encodeURIComponent(trimmed)}`,
      );
      const payload = (await response.json()) as InspectorBundle & { error?: string; message?: string };
      if (!response.ok) {
        setBundle(null);
        setError(payload.message ?? payload.error ?? "Could not load raw extraction.");
        return;
      }
      setBundle(payload);
    } catch {
      setBundle(null);
      setError("Network error while loading raw extraction.");
    } finally {
      setLoading(false);
    }
  }, [caseId, studyRunId]);

  useEffect(() => {
    if (initialStudyRunId?.trim()) {
      void load();
    }
  }, [initialStudyRunId, load]);

  const copyExport = useCallback(async () => {
    if (!bundle) {
      return;
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(bundle.downloadPayload, null, 2));
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      setCopyState("failed");
    }
  }, [bundle]);

  const downloadHref =
    bundle && studyRunId.trim()
      ? `/api/case/${encodeURIComponent(caseId)}/raw-extraction/download?studyRunId=${encodeURIComponent(studyRunId.trim())}`
      : undefined;

  const runRawExtraction = useCallback(async () => {
    const intakeRunId = bundle?.intakeRunId;
    if (!intakeRunId) {
      setError("No intake run is linked to this study; start pack-driven extraction from Intake.");
      setRunState("idle");
      return;
    }
    setRunState("running");
    setError(null);
    try {
      const response = await fetch(`/api/intake/runs/${encodeURIComponent(intakeRunId)}/study`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processingMode: "pack_driven_v1" }),
      });
      const payload = (await response.json()) as { run?: { studyRunId?: string }; message?: string };
      if (!response.ok) {
        setError(payload.message ?? "Could not start raw extraction.");
        setRunState("idle");
        return;
      }
      const nextRunId = payload.run?.studyRunId;
      if (nextRunId) {
        setStudyRunId(nextRunId);
        const loadResponse = await fetch(
          `/api/case/${encodeURIComponent(caseId)}/raw-extraction?studyRunId=${encodeURIComponent(nextRunId)}`,
        );
        const loaded = (await loadResponse.json()) as InspectorBundle & {
          error?: string;
          message?: string;
        };
        if (loadResponse.ok) {
          setBundle(loaded);
        }
      }
      setRunState("idle");
    } catch {
      setError("Network error while starting raw extraction.");
      setRunState("idle");
    }
  }, [bundle?.intakeRunId, caseId]);

  const runCanonicalStudy = useCallback(async () => {
    const trimmed = studyRunId.trim();
    if (!trimmed) {
      setError("Enter a study run ID.");
      return;
    }
    setCanonicalRunState("running");
    setError(null);
    try {
      const response = await fetch(`/api/case/${encodeURIComponent(caseId)}/canonical-study/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studyRunId: trimmed }),
      });
      const payload = (await response.json()) as {
        error?: string;
        message?: string;
        affectedDocumentIds?: string[];
        readerPack?: {
          packId?: string;
          packVersion?: string;
          packContentSha256?: string;
        };
        compatibilityErrors?: string[];
        expectedSnapshotPath?: string;
        onDiskCurrentPackContentSha256?: string | null;
      };
      if (!response.ok) {
        setError(
          payload.error === "PACK_NOT_AVAILABLE"
            ? [
                "PACK_NOT_AVAILABLE: no Reader Domain Pack snapshot matches the persisted envelope.",
                payload.readerPack
                  ? `Reader pack: ${payload.readerPack.packId}@${payload.readerPack.packVersion} hash ${payload.readerPack.packContentSha256}`
                  : null,
                payload.onDiskCurrentPackContentSha256
                  ? `Current on-disk pack hash: ${payload.onDiskCurrentPackContentSha256}`
                  : null,
                payload.expectedSnapshotPath
                  ? `Missing snapshot: ${payload.expectedSnapshotPath}`
                  : null,
                ...(payload.compatibilityErrors ?? []),
              ]
                .filter((line): line is string => Boolean(line))
                .join(" ")
            : payload.error === "SOURCE_PAGES_UNAVAILABLE"
              ? `SOURCE_PAGES_UNAVAILABLE: trusted document pages are missing for ${(payload.affectedDocumentIds ?? []).join(", ") || "one or more documents"}.`
              : (payload.message ?? payload.error ?? "Could not run deterministic canonical study."),
        );
        setCanonicalRunState("idle");
        return;
      }
      router.push(
        `/hives/${encodeURIComponent(caseId)}/canonical-debug?studyRunId=${encodeURIComponent(trimmed)}`,
      );
    } catch {
      setError("Network error while running deterministic canonical study.");
      setCanonicalRunState("idle");
    }
  }, [caseId, router, studyRunId]);

  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-[var(--hfy-line)] bg-[var(--hfy-honey-wash)] px-4 py-3 text-sm text-[var(--hfy-honey-deep)]">
        <strong>Unvalidated model extraction.</strong> This inspector shows Anthropic output exactly as
        persisted. Nothing here is verified, consolidated, or safe for Customer/Pro reporting.
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
          {loading ? "Loading…" : "Load extraction"}
        </button>
      </div>

      {error ? (
        <p className="text-sm text-[var(--hfy-coral-deep)]" role="alert">
          {error}
        </p>
      ) : null}

      {bundle ? (
        <>
          <section className="grid gap-4 rounded-xl border border-[var(--hfy-line)] bg-[var(--hfy-surface)] p-5 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--hfy-quiet)]">Study run</p>
              <p className="font-mono text-sm break-all">{bundle.studyRunId}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--hfy-quiet)]">Attempt</p>
              <p className="font-mono text-sm break-all">{bundle.attemptId ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--hfy-quiet)]">Overall status</p>
              <p className="text-sm">
                Run: {bundle.studyRunStatus}
                {bundle.rawExtractionOutcome ? ` · Raw: ${bundle.rawExtractionOutcome}` : null}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--hfy-quiet)]">Model</p>
              <p className="text-sm">
                {bundle.modelProvider ?? "—"} / {bundle.modelId ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--hfy-quiet)]">Domain pack</p>
              <p className="text-sm">
                {bundle.domainPackId ?? "—"} @ {bundle.domainPackVersion ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--hfy-quiet)]">Processing time</p>
              <p className="text-sm">
                {bundle.processingTimeMs != null ? `${bundle.processingTimeMs} ms (sum of document calls)` : "—"}
              </p>
            </div>
          </section>

          <div className="flex flex-wrap gap-3">
            <button type="button" className="hfy-btn" onClick={() => void copyExport()}>
              {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy JSON"}
            </button>
            {downloadHref ? (
              <a className="hfy-btn" href={downloadHref}>
                Download raw artifact
              </a>
            ) : null}
            {runState === "confirming" ? (
              <>
                <button
                  type="button"
                  className="hfy-btn hfy-btn--primary"
                  onClick={() => void runRawExtraction()}
                >
                  Confirm Run Raw Extraction (pack_driven_v1)
                </button>
                <button type="button" className="hfy-btn hfy-btn--quiet" onClick={() => setRunState("idle")}>
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                className="hfy-btn hfy-btn--quiet"
                disabled={runState === "running"}
                onClick={() => setRunState("confirming")}
              >
                {runState === "running" ? "Starting…" : "Run Raw Extraction (internal)"}
              </button>
            )}
            <button
              type="button"
              className="hfy-btn hfy-btn--primary"
              disabled={canonicalRunState === "running" || !studyRunId.trim()}
              onClick={() => void runCanonicalStudy()}
            >
              {canonicalRunState === "running" ? "Running…" : "Run Canonical Study (internal)"}
            </button>
          </div>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-[var(--hfy-text)]">Documents (Engine 1 order)</h2>
            {bundle.documents.map((doc, index) => (
              <article
                key={doc.sourceDocumentId}
                className="space-y-3 rounded-xl border border-[var(--hfy-line)] bg-[var(--hfy-surface)] p-5"
              >
                <header className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-[var(--hfy-text)]">
                      {index + 1}. {doc.customerLabel ?? doc.logicalDocumentId ?? "Logical document"}
                    </p>
                    <p className="font-mono text-xs text-[var(--hfy-quiet)] break-all">{doc.sourceDocumentId}</p>
                  </div>
                  <StatusBadge status={doc.displayStatus} />
                </header>
                <p className="text-xs text-[var(--hfy-quiet)]">{bundle.disclaimer}</p>
                <p className="text-sm">
                  <span className="font-medium">Model classification:</span>{" "}
                  {doc.modelDocumentClassification ?? "—"}
                </p>
                <div>
                  <p className="mb-1 text-sm font-medium">Parse diagnostics</p>
                  <ul className="list-disc pl-5 text-sm text-[var(--hfy-graphite)]">
                    {doc.parseDiagnostics.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
                {doc.records.length > 0 ? (
                  <div>
                    <p className="mb-2 text-sm font-medium">Extracted records</p>
                    <ul className="space-y-2 text-sm">
                      {doc.records.map((record) => (
                        <li key={record.recordTypeId} className="rounded-lg bg-[var(--hfy-mist)] px-3 py-2">
                          <p className="font-medium">{record.recordTypeId}</p>
                          <ul className="mt-1 space-y-1 pl-3">
                            {Object.entries(record.fields).map(([fieldName, field]) => (
                              <li key={fieldName}>
                                <span className="font-mono text-xs">{fieldName}</span>:{" "}
                                {typeof field.value === "string"
                                  ? field.value
                                  : JSON.stringify(field.value)}
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {doc.evidenceRefs.length > 0 ? (
                  <div>
                    <p className="mb-2 text-sm font-medium">Evidence references (model-generated)</p>
                    <ul className="space-y-1 text-sm">
                      {doc.evidenceRefs.map((evidence) => (
                        <li key={`${evidence.fieldPath}-${evidence.page}-${evidence.quote}`} className="font-mono text-xs">
                          {evidence.fieldPath}: doc={evidence.sourceDocumentId} page={evidence.page ?? "?"} quote=&quot;
                          {evidence.quote ?? ""}&quot;
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div>
                  <p className="mb-2 text-sm font-medium">Extraction provenance (persisted envelope)</p>
                  <EnvelopeProvenance envelope={doc.envelope} />
                </div>
                <JsonBlock label="rawAssistantText (exact)" value={doc.envelope?.rawAssistantText} />
                <JsonBlock label="parsedModelJson (formatted)" value={doc.envelope?.parsedModelJson} />
              </article>
            ))}
          </section>
        </>
      ) : null}
    </div>
  );
}
