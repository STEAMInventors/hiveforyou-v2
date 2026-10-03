"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import type { ResolvedEvidenceRef } from "@hiveforyou/shared/projections";

import { fetchEvidenceTrace } from "@/lib/evidence/evidence-trace-client";
import { buildSourceDocumentFileHref } from "@/lib/evidence/source-document-file-client";
import { domainLabel } from "@/lib/case/domain-display";

type EvidenceDrawerProps = {
  claimStatement?: string;
  studyRunId?: string;
  evidence: ResolvedEvidenceRef[];
  onClose: () => void;
  /** Customer case map hides hashes, geometry, and internal ids. */
  presentation?: "default" | "customer";
  /** Fill the parent column instead of a floating sheet. */
  embedded?: boolean;
};

export function EvidenceDrawer({
  claimStatement,
  studyRunId,
  evidence,
  onClose,
  presentation = "default",
  embedded = false,
}: EvidenceDrawerProps) {
  const [traces, setTraces] = useState<ResolvedEvidenceRef[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [evidence]);

  useEffect(() => {
    if (!studyRunId || !evidence.length) {
      setTraces(null);
      return;
    }
    let cancelled = false;
    setLoadError(false);
    void Promise.all(
      evidence.map((ref) =>
        fetchEvidenceTrace({ studyRunId, evidenceRefId: ref.id }),
      ),
    )
      .then((resolved) => {
        if (!cancelled) {
          setTraces(resolved);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(true);
          setTraces(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [studyRunId, evidence]);

  if (!evidence.length) {
    return null;
  }

  const rows = traces ?? evidence;
  const frameClass = embedded
    ? "flex w-full flex-col overflow-hidden rounded-2xl border border-hive-border bg-hive-surface shadow-hive-md"
    : "fixed bottom-0 left-0 right-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-hive-xl border border-hive-border bg-hive-surface p-5 shadow-hive-lg lg:static lg:max-h-none lg:w-96 lg:shrink-0 lg:rounded-hive-xl";

  return (
    <>
      {embedded ? null : (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-hive-navy/20 lg:hidden"
          aria-label="Close evidence"
          onClick={onClose}
        />
      )}
      <aside
        data-testid="evidence-drawer"
        data-presentation={presentation}
        className={frameClass}
        aria-label="Evidence"
      >
        {presentation === "customer" ? (
          <CustomerEvidenceBody
            studyRunId={studyRunId}
            rows={rows}
            selectedIndex={Math.min(selectedIndex, Math.max(rows.length - 1, 0))}
            onSelect={setSelectedIndex}
            loadError={loadError}
            loading={!loadError && !traces && Boolean(studyRunId)}
            onClose={onClose}
          />
        ) : (
          <DefaultEvidenceBody
            studyRunId={studyRunId}
            rows={rows}
            claimStatement={claimStatement}
            loadError={loadError}
            loading={!loadError && !traces && Boolean(studyRunId)}
            onClose={onClose}
          />
        )}
      </aside>
    </>
  );
}

function CustomerEvidenceBody({
  studyRunId,
  rows,
  selectedIndex,
  onSelect,
  loadError,
  loading,
  onClose,
}: {
  studyRunId?: string;
  rows: ResolvedEvidenceRef[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  loadError: boolean;
  loading: boolean;
  onClose: () => void;
}) {
  const selected = rows[selectedIndex] ?? rows[0];
  if (!selected) {
    return null;
  }

  const page = pageValue(selected);

  return (
    <>
      <div className="flex items-center justify-between border-b border-hive-border bg-hive-page/60 px-5 py-4">
        <h2 className="font-sans text-base font-bold text-hive-navy">Evidence</h2>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-hive-text-muted hover:bg-hive-page hover:text-hive-navy"
          aria-label="Close"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {rows.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto border-b border-hive-border bg-hive-page/40 p-3">
          {rows.map((ref, index) => (
            <button
              key={ref.id}
              type="button"
              className={[
                "shrink-0 rounded-lg px-3 py-1.5 font-mono text-xs",
                index === selectedIndex
                  ? "border border-hive-border bg-hive-surface font-bold text-hive-navy shadow-hive"
                  : "text-hive-text-muted hover:text-hive-navy",
              ].join(" ")}
              onClick={() => onSelect(index)}
            >
              {sourceName(ref)}
            </button>
          ))}
        </div>
      ) : null}
      <div className="space-y-5 p-5">
        {loadError ? (
          <p className="font-sans text-sm text-hive-text-muted" role="alert">
            Could not load the exact source. Showing what is already saved.
          </p>
        ) : null}
        {loading ? (
          <p className="font-sans text-xs text-hive-text-muted" role="status">
            Loading source…
          </p>
        ) : null}
        {selected.canonicalTextSnippet ? (
          <blockquote className="rounded-xl border-l-4 border-hive-sage bg-hive-soft-sky/50 p-4">
            <EvidenceTextPane
              text={selected.canonicalTextSnippet}
              span={selected.span}
              region={undefined}
            />
          </blockquote>
        ) : null}
        <dl
          className="space-y-2 rounded-xl border border-hive-border bg-hive-page p-4 font-mono text-xs text-hive-text-muted"
          data-testid="evidence-trace-item"
        >
          <CustomerRow label="Source" value={sourceName(selected)} />
          {page ? <CustomerRow label="Page" value={page} /> : null}
          <CustomerRow
            label="Match to source"
            value={customerResolutionLabel(selected.resolution)}
            testId="evidence-match"
          />
        </dl>
        <OpenSourceDocumentLink studyRunId={studyRunId} ref={selected} />
      </div>
    </>
  );
}

function DefaultEvidenceBody({
  studyRunId,
  rows,
  claimStatement,
  loadError,
  loading,
  onClose,
}: {
  studyRunId?: string;
  rows: ResolvedEvidenceRef[];
  claimStatement?: string;
  loadError: boolean;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg font-bold text-hive-navy">Evidence</h2>
          {claimStatement ? (
            <p className="mt-1 font-sans text-sm text-hive-text-muted">{claimStatement}</p>
          ) : null}
        </div>
        <button
          type="button"
          className="rounded-hive p-1 text-hive-text-muted hover:bg-hive-soft-sky hover:text-hive-navy"
          aria-label="Close"
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      {loadError ? (
        <p className="font-sans text-sm text-hive-text-muted" role="alert">
          Could not load exact source locations. Showing document metadata only.
        </p>
      ) : null}
      {loading ? (
        <p className="mb-4 font-sans text-xs text-hive-text-muted" role="status">
          Loading source trace…
        </p>
      ) : null}
      <ul className="space-y-4">
        {rows.map((ref) => (
          <li
            key={ref.id}
            className="rounded-hive-lg border border-hive-border bg-hive-page/50 p-3"
            data-testid="evidence-trace-item"
          >
            <dl className="space-y-2 font-sans text-sm">
              <Row
                label="Document"
                value={ref.logicalTitle ?? ref.sourceFilename ?? ref.sourceDocumentId}
              />
              {ref.logicalDocumentType ? (
                <Row label="Type" value={ref.logicalDocumentType} />
              ) : null}
              {ref.logicalDomainId ? (
                <Row label="Domain" value={domainLabel(ref.logicalDomainId)} />
              ) : null}
              {ref.physicalPageNumber != null ? (
                <Row label="Source page" value={String(ref.physicalPageNumber)} />
              ) : ref.page != null ? (
                <Row label="Page" value={String(ref.page)} />
              ) : null}
              {ref.logicalPageNumber != null ? (
                <Row label="Page in document" value={String(ref.logicalPageNumber)} />
              ) : null}
              {ref.resolution ? (
                <Row label="Match to source" value={humanResolutionLabel(ref.resolution)} />
              ) : null}
              {ref.canonicalTextSnippet ? (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-hive-text-muted">
                    Extracted text
                  </dt>
                  <dd className="mt-1">
                    <EvidenceTextPane
                      text={ref.canonicalTextSnippet}
                      span={ref.span}
                      region={ref.region}
                    />
                  </dd>
                </div>
              ) : null}
              {ref.sha256 ? <Row label="SHA-256" value={ref.sha256} mono /> : null}
            </dl>
            <OpenSourceDocumentLink studyRunId={studyRunId} ref={ref} />
          </li>
        ))}
      </ul>
    </>
  );
}

function OpenSourceDocumentLink({
  studyRunId,
  ref: evidenceRef,
}: {
  studyRunId?: string;
  ref: ResolvedEvidenceRef;
}) {
  if (!studyRunId || !evidenceRef.sourceDocumentId) {
    return null;
  }
  const page = evidenceRef.physicalPageNumber ?? evidenceRef.page ?? null;
  return (
    <a
      className="mt-3 inline-flex items-center gap-1 font-sans text-sm font-semibold text-hive-navy underline-offset-2 hover:underline"
      href={buildSourceDocumentFileHref(studyRunId, evidenceRef.sourceDocumentId, page)}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="evidence-open-full-page"
    >
      Open full page
    </a>
  );
}

function sourceName(ref: ResolvedEvidenceRef): string {
  return ref.sourceFilename?.trim() || ref.logicalTitle?.trim() || "Source";
}

function pageValue(ref: ResolvedEvidenceRef): string | null {
  const physical = ref.physicalPageNumber ?? ref.page ?? null;
  const logical = ref.logicalPageNumber ?? null;
  if (physical == null && logical == null) {
    return null;
  }
  if (physical != null && logical != null && logical !== physical) {
    return `${physical} · ${logical} in the document`;
  }
  return String(physical ?? logical);
}

function customerResolutionLabel(
  resolution: ResolvedEvidenceRef["resolution"],
): string {
  switch (resolution) {
    case "EXACT":
      return "Exact";
    case "PARTIAL":
      return "Partial";
    case "UNRESOLVED":
      return "Unavailable";
    default:
      return "Unavailable";
  }
}

function EvidenceTextPane({
  text,
  span,
  region,
}: {
  text: string;
  span?: { start: number; end: number };
  region?: ResolvedEvidenceRef["region"];
}) {
  const canHighlight =
    span &&
    span.start >= 0 &&
    span.end <= text.length &&
    span.start < span.end;

  return (
    <div className="rounded-hive border border-hive-border bg-hive-surface p-2">
      {canHighlight ? (
        <p className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-hive-navy">
          {text.slice(0, span.start)}
          <mark className="rounded bg-hive-sage/30 px-0.5">{text.slice(span.start, span.end)}</mark>
          {text.slice(span.end)}
        </p>
      ) : (
        <p className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-hive-navy">
          {text}
        </p>
      )}
      {region ? (
        <p
          className="mt-2 font-mono text-[10px] text-hive-text-muted"
          data-testid="evidence-region"
        >
          Region ({region.coordinateSpace}): x={region.x}, y={region.y}, w={region.width}, h=
          {region.height}
        </p>
      ) : null}
    </div>
  );
}

function humanResolutionLabel(
  resolution: NonNullable<ResolvedEvidenceRef["resolution"]>,
): string {
  switch (resolution) {
    case "EXACT":
      return "Exact match in source";
    case "PARTIAL":
      return "Partial match in source";
    case "UNRESOLVED":
      return "Could not pin to exact text";
    default:
      return resolution;
  }
}

function CustomerRow({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId?: string;
}) {
  return (
    <div className="flex justify-between gap-3 border-b border-hive-border/60 py-1 last:border-b-0" data-testid={testId}>
      <dt>{label}</dt>
      <dd className="text-right font-semibold text-hive-navy">{value}</dd>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-hive-text-muted">
        {label}
      </dt>
      <dd className={`mt-0.5 text-hive-navy ${mono ? "font-mono text-xs break-all" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
