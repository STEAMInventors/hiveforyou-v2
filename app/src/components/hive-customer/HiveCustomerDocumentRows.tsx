"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useState } from "react";

import { fetchHiveExtractionProgress } from "@/lib/hive-customer/hive-extraction-progress-client";
import type { HiveExtractionProgressView } from "@/lib/hive-customer/hive-extraction-progress-types";
import { shouldPollHiveExtractionProgress } from "@/lib/hive-customer/hive-extraction-progress-types";
import {
  customerStatusLabel,
  type CustomerExtractedDetail,
  type CustomerExtractionDocumentRow,
} from "@/lib/hive-customer/map-customer-extraction-ui-state";

const RAW_EXTRACTION_POLL_MS = 2500;

function DocumentFileIcon() {
  return (
    <svg
      aria-hidden
      className="h-5 w-5 text-customerHive-on-surface-variant"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function StatusSpinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-[11px] w-[11px] shrink-0 animate-spin rounded-full border-2 border-[rgba(135,87,0,0.25)] border-t-[#875700] ${className ?? ""}`}
    />
  );
}

function CustomerSourceReferenceChip({ label }: { label: string }) {
  return (
    <span
      className="inline-flex max-w-full select-none items-center gap-1.5 rounded-full border border-[#E3E7ED] bg-[#F1F4F8] px-2.5 py-0.5 font-mono text-[12.5px] leading-tight text-[#3A4350]"
      title={label}
    >
      <svg
        aria-hidden
        className="h-3 w-3 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      <span className="truncate">{label}</span>
    </span>
  );
}

function documentTitle(row: CustomerExtractionDocumentRow): string {
  return row.filename?.trim() || row.label;
}

function documentSubtitle(row: CustomerExtractionDocumentRow): string | null {
  const parts: string[] = [];
  if (row.filename && row.label !== row.filename) {
    parts.push(row.label);
  }
  if (row.dateLabel) {
    parts.push(row.dateLabel);
  }
  return parts.length > 0 ? parts.join(" · ") : row.dateLabel;
}

function statusPillClasses(status: CustomerExtractionDocumentRow["uiStatus"]): string {
  switch (status) {
    case "read":
      return "bg-[#EAF6EE] text-[#1E7A41]";
    case "failed":
      return "bg-[#FDEDEB] text-[#B4352A]";
    case "needs_review":
      return "bg-[#FFF6DC] text-[#7A5200]";
    case "reading":
      return "bg-[#FFF8E6] text-[#875700]";
    default:
      return "bg-[#FFF8E6] text-[#875700]";
  }
}

function showsProcessingSpinner(status: CustomerExtractionDocumentRow["uiStatus"]): boolean {
  return status === "waiting" || status === "reading";
}

function groupExtractedDetails(
  details: CustomerExtractedDetail[],
): Array<{ groupLabel: string; items: CustomerExtractedDetail[] }> {
  const order: string[] = [];
  const byGroup = new Map<string, CustomerExtractedDetail[]>();
  for (const detail of details) {
    const key = detail.groupLabel.trim() || "Details";
    if (!byGroup.has(key)) {
      byGroup.set(key, []);
      order.push(key);
    }
    byGroup.get(key)?.push(detail);
  }
  return order.map((groupLabel) => ({
    groupLabel,
    items: byGroup.get(groupLabel) ?? [],
  }));
}

function CustomerDocumentExtractionExpandable({
  row,
  defaultExpanded = false,
}: {
  row: CustomerExtractionDocumentRow;
  defaultExpanded?: boolean;
}) {
  const panelId = useId();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const groups = useMemo(
    () => groupExtractedDetails(row.extractedDetails),
    [row.extractedDetails],
  );
  const canExpand = row.uiStatus === "read" && row.extractedDetails.length > 0;

  return (
    <article
      className="overflow-hidden rounded-2xl border border-customerHive-border bg-white"
      data-testid="customer-raw-extraction-document"
    >
      <button
        type="button"
        className="flex w-full min-w-0 flex-wrap items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-[#FAFBFC] sm:gap-4 sm:px-5 sm:py-[18px] disabled:cursor-default disabled:hover:bg-white"
        aria-expanded={canExpand ? expanded : undefined}
        aria-controls={canExpand ? panelId : undefined}
        disabled={!canExpand}
        onClick={() => {
          if (canExpand) {
            setExpanded((open) => !open);
          }
        }}
      >
        <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[11px] bg-[#F1F4F8]">
          <DocumentFileIcon />
        </span>
        <div className="min-w-0 flex-1 basis-[200px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold text-customerHive-on-surface">
              {documentTitle(row)}
            </span>
            {row.documentTypeLabel ? (
              <span className="inline-flex h-[22px] items-center rounded-md bg-[#F1F3F6] px-2 text-xs font-semibold text-customerHive-on-surface-variant">
                {row.documentTypeLabel}
              </span>
            ) : null}
          </div>
          {documentSubtitle(row) ? (
            <p className="mt-1 truncate text-[13.5px] text-customerHive-on-surface-muted">
              {documentSubtitle(row)}
            </p>
          ) : null}
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold ${statusPillClasses(row.uiStatus)}`}
        >
          {showsProcessingSpinner(row.uiStatus) ? <StatusSpinner /> : null}
          {customerStatusLabel(row.uiStatus)}
          {row.uiStatus === "read" && row.detailCount != null ? ` · ${row.detailCount}` : null}
        </span>
        {canExpand ? (
          <svg
            aria-hidden
            className={`h-5 w-5 shrink-0 text-customerHive-on-surface-muted transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        ) : null}
      </button>

      {row.uiStatus === "failed" || row.uiStatus === "needs_review" ? (
        <div className="border-t border-[#EEF0F3] px-4 pb-4 pl-[4.75rem] pt-2 text-sm leading-relaxed text-[#B4352A] sm:px-5 sm:pl-[5.5rem]">
          {row.failureHint ??
            (row.uiStatus === "needs_review"
              ? "This document needs review before its details can be shown."
              : "This document could not be read successfully.")}
        </div>
      ) : null}

      {canExpand && expanded ? (
        <div
          id={panelId}
          className="border-t border-[#EEF0F3] bg-[#FCFCFD] px-4 py-5 pl-[4.75rem] sm:px-5 sm:pl-[5.5rem]"
        >
          <p className="mb-4 text-[13px] font-semibold text-customerHive-on-surface-muted">
            What we found in this document
          </p>
          <div className="flex flex-col gap-5">
            {groups.map((group) => (
              <div key={group.groupLabel} className="flex flex-col gap-2.5">
                <h4
                  className="text-sm font-semibold text-customerHive-on-surface"
                  style={{ fontFamily: "var(--font-outfit), sans-serif" }}
                >
                  {group.groupLabel}
                </h4>
                <ul className="flex flex-col gap-3">
                  {group.items.map((detail) => (
                    <li
                      key={`${detail.label}-${detail.value}`}
                      className="flex min-w-0 flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-start sm:gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-medium uppercase tracking-wide text-customerHive-on-surface-muted">
                          {detail.label}
                        </span>
                        <p className="text-[15px] leading-snug text-customerHive-on-surface">
                          {detail.value}
                        </p>
                      </div>
                      {detail.provenance ? (
                        <div className="flex min-w-0 max-w-full flex-col gap-1.5 sm:max-w-[min(100%,420px)]">
                          <p className="font-serif text-sm leading-snug text-customerHive-on-surface-variant">
                            {detail.provenance.text}
                          </p>
                          <CustomerSourceReferenceChip label={detail.provenance.chipLabel} />
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {row.provenance && row.extractedDetails.length === 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-customerHive-on-surface-variant">
              <span className="font-serif leading-snug">{row.provenance.text}</span>
              <CustomerSourceReferenceChip label={row.provenance.chipLabel} />
            </div>
          ) : null}
        </div>
      ) : null}

      {row.uiStatus === "read" && !canExpand && row.provenance ? (
        <div className="border-t border-[#EEF0F3] bg-[#FCFCFD] px-4 py-3 pl-[4.75rem] sm:px-5 sm:pl-[5.5rem]">
          <div className="flex flex-wrap items-center gap-2 text-sm text-customerHive-on-surface-variant">
            <span className="font-serif leading-snug">{row.provenance.text}</span>
            <CustomerSourceReferenceChip label={row.provenance.chipLabel} />
          </div>
        </div>
      ) : null}
    </article>
  );
}

function CustomerDocumentCardCompact({
  row,
  showProvenance = true,
}: {
  row: CustomerExtractionDocumentRow;
  showProvenance?: boolean;
}) {
  return (
    <article
      className="overflow-hidden rounded-2xl border border-customerHive-border bg-white"
      data-testid="customer-raw-extraction-document"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-3 px-4 py-4 sm:gap-4 sm:px-5 sm:py-[18px]">
        <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[11px] bg-[#F1F4F8]">
          <DocumentFileIcon />
        </span>
        <div className="min-w-0 flex-1 basis-[200px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold text-customerHive-on-surface">
              {documentTitle(row)}
            </span>
            {row.documentTypeLabel ? (
              <span className="inline-flex h-[22px] items-center rounded-md bg-[#F1F3F6] px-2 text-xs font-semibold text-customerHive-on-surface-variant">
                {row.documentTypeLabel}
              </span>
            ) : null}
          </div>
          {documentSubtitle(row) ? (
            <p className="mt-1 truncate text-[13.5px] text-customerHive-on-surface-muted">
              {documentSubtitle(row)}
            </p>
          ) : null}
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold ${statusPillClasses(row.uiStatus)}`}
        >
          {showsProcessingSpinner(row.uiStatus) ? <StatusSpinner /> : null}
          {row.uiStatus === "read" && row.detailCount != null
            ? `Read · ${row.detailCount} details`
            : customerStatusLabel(row.uiStatus)}
        </span>
      </div>
      {row.uiStatus === "failed" || row.uiStatus === "needs_review" ? (
        <div className="border-t border-[#EEF0F3] px-4 pb-4 pl-[4.75rem] pt-2 text-sm leading-relaxed text-[#B4352A] sm:px-5 sm:pl-[5.5rem]">
          {row.failureHint ??
            (row.uiStatus === "needs_review"
              ? "This document needs review before it can be used."
              : "This document could not be read successfully.")}
        </div>
      ) : null}
      {showProvenance && row.uiStatus === "read" && row.provenance ? (
        <div className="border-t border-[#EEF0F3] px-4 py-3 pl-[4.75rem] sm:px-5 sm:pl-[5.5rem]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-customerHive-on-surface">{row.provenance.text}</span>
            <CustomerSourceReferenceChip label={row.provenance.chipLabel} />
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function HiveExtractionProcessingBanner() {
  return (
    <div
      className="grid gap-6 rounded-[18px] border border-customerHive-border bg-white p-6 sm:p-7 md:grid-cols-[minmax(0,1fr)_minmax(0,280px)] md:gap-7"
      role="status"
    >
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-[22px] w-[22px] shrink-0 animate-spin rounded-full border-[2.5px] border-[#DCE6FB] border-t-customerHive-secondary" />
          <h3
            className="text-xl font-semibold text-customerHive-on-surface"
            style={{ fontFamily: "var(--font-outfit), sans-serif" }}
          >
            Reading your documents
          </h3>
        </div>
        <p className="text-[15.5px] leading-relaxed text-customerHive-on-surface-variant">
          We&apos;re identifying the documents and organizing the information we find. You can leave
          this page; we&apos;ll keep going.
        </p>
      </div>
      <p className="text-sm leading-relaxed text-customerHive-on-surface-muted md:self-center">
        Status updates automatically every few seconds.
      </p>
    </div>
  );
}

export function HiveExtractionOutcomeBanner({
  documents,
  extractionComplete,
  terminalFailure,
}: {
  documents: CustomerExtractionDocumentRow[];
  extractionComplete: boolean;
  terminalFailure: boolean;
}) {
  const readCount = documents.filter((row) => row.uiStatus === "read").length;
  const failedCount = documents.filter(
    (row) => row.uiStatus === "failed" || row.uiStatus === "needs_review",
  ).length;

  if (terminalFailure && failedCount > 0 && readCount === 0) {
    return (
      <div
        className="flex flex-wrap items-center gap-4 rounded-[18px] border border-[#F7D3CF] bg-[#FFF9F8] px-5 py-5 sm:px-6"
        role="alert"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#FDEDEB] text-[#B4352A]">
          <svg aria-hidden className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </span>
        <div className="min-w-0 flex-1 basis-[240px]">
          <p className="text-base font-semibold text-customerHive-on-surface">
            Extraction did not finish successfully
          </p>
          <p className="mt-0.5 text-sm leading-relaxed text-customerHive-on-surface-variant">
            Return to your files to try again or add more documents. No documents were read
            successfully.
          </p>
        </div>
      </div>
    );
  }

  if (extractionComplete && failedCount === 0) {
    return (
      <div
        className="flex flex-wrap items-center gap-4 rounded-[18px] border border-customerHive-border bg-white px-5 py-5 sm:px-6"
        role="status"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EAF6EE] text-[#1E7A41]">
          <svg aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" viewBox="0 0 24 24">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
        <div className="min-w-0 flex-1 basis-[240px]">
          <p
            className="text-[17px] font-semibold text-customerHive-on-surface"
            style={{ fontFamily: "var(--font-outfit), sans-serif" }}
          >
            All {readCount} document{readCount === 1 ? "" : "s"} are ready
          </p>
          <p className="mt-0.5 text-[15px] text-customerHive-on-surface-variant">
            Next, build your study to connect what they say across documents.
          </p>
        </div>
      </div>
    );
  }

  if (failedCount > 0) {
    return (
      <div
        className="flex flex-wrap items-center gap-4 rounded-[18px] border border-[#F7D3CF] bg-[#FFF9F8] px-5 py-5 sm:px-6"
        role="alert"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#FDEDEB] text-[#B4352A]">
          <svg aria-hidden className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </span>
        <div className="min-w-0 flex-1 basis-[240px]">
          <p className="text-base font-semibold text-customerHive-on-surface">
            {readCount} document{readCount === 1 ? "" : "s"} ready
            {failedCount === 1 ? ". One needs attention." : `. ${failedCount} need attention.`}
          </p>
          <p className="mt-0.5 text-sm leading-relaxed text-customerHive-on-surface-variant">
            Review the documents below. You can continue to your study when extraction has finished.
          </p>
        </div>
      </div>
    );
  }

  return null;
}

export function CustomerRawExtractionsPanel({
  caseId,
  studyRunId,
  variant = "customer",
  presentation = "detailed",
  pollWhileProcessing = true,
  showProcessingBanner = false,
  showOutcomeBanner = false,
}: {
  caseId: string;
  studyRunId?: string | null;
  variant?: "customer" | "intake";
  presentation?: "summary" | "detailed";
  pollWhileProcessing?: boolean;
  showProcessingBanner?: boolean;
  showOutcomeBanner?: boolean;
}) {
  const trimmedStudyRunId = studyRunId?.trim() ?? "";
  const [progress, setProgress] = useState<HiveExtractionProgressView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(trimmedStudyRunId));

  const refresh = useCallback(async () => {
    if (!trimmedStudyRunId) {
      setProgress(null);
      setLoading(false);
      setError(null);
      return;
    }
    try {
      const next = await fetchHiveExtractionProgress(caseId, trimmedStudyRunId);
      setProgress(next);
      setError(null);
    } catch {
      setError("We couldn't load extracted document details. Try refreshing this page.");
    } finally {
      setLoading(false);
    }
  }, [caseId, trimmedStudyRunId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!pollWhileProcessing || !trimmedStudyRunId) {
      return;
    }
    if (!shouldPollHiveExtractionProgress(progress)) {
      return;
    }
    const timer = window.setInterval(() => {
      void refresh();
    }, RAW_EXTRACTION_POLL_MS);
    return () => window.clearInterval(timer);
  }, [pollWhileProcessing, progress, refresh, trimmedStudyRunId]);

  const mutedText =
    variant === "intake" ? "text-[#5F6368]" : "text-sm text-customerHive-on-surface-variant";
  const emptyPanelClass =
    variant === "intake"
      ? "rounded-xl border border-[#E8EAED] bg-[#F8F9FA] px-5 py-8 text-center text-sm text-[#5F6368]"
      : "rounded-2xl border border-customerHive-border bg-white px-5 py-8 text-center text-sm text-customerHive-on-surface-variant";

  if (!trimmedStudyRunId) {
    return (
      <div data-testid="customer-raw-extractions-panel" className={emptyPanelClass}>
        <p className="font-medium text-customerHive-on-surface">Study link needed</p>
        <p className="mt-1">
          Open this page from your hive building flow, or add{" "}
          <span className="font-mono text-xs">studyRunId</span> to the URL so we can load
          extraction progress.
        </p>
      </div>
    );
  }

  const terminalFailure =
    progress?.extractionTerminal && !progress.extractionCompleteForExplore;
  const processing = progress && shouldPollHiveExtractionProgress(progress);
  const useExpandableCards =
    presentation === "detailed" && Boolean(progress?.extractionCompleteForExplore);

  return (
    <section
      data-testid="customer-raw-extractions-panel"
      aria-label="Raw extractions"
      className="flex min-w-0 flex-col gap-4"
    >
      <p className={mutedText}>
        Review what was read from each document. These details come from source pages and are not
        yet validated for reporting.
      </p>

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {loading && !progress ? (
        <p className={mutedText} aria-busy="true">
          Loading extractions…
        </p>
      ) : null}

      {showProcessingBanner && processing && !terminalFailure ? (
        <HiveExtractionProcessingBanner />
      ) : null}

      {showOutcomeBanner && progress?.documents.length ? (
        <HiveExtractionOutcomeBanner
          documents={progress.documents}
          extractionComplete={progress.extractionCompleteForExplore}
          terminalFailure={Boolean(terminalFailure)}
        />
      ) : null}

      {terminalFailure && !showOutcomeBanner ? (
        <div
          className={
            variant === "intake"
              ? "rounded-xl border border-[#FCE8E6] bg-[#FCE8E6] px-4 py-3 text-sm text-[#5F2120]"
              : "rounded-[18px] border border-[#F7D3CF] bg-[#FFF9F8] px-4 py-3 text-sm text-customerHive-on-surface-variant"
          }
          role="alert"
        >
          Extraction did not finish successfully for every document. You can return to your files
          to try again or add more documents.
        </div>
      ) : null}

      {progress?.documents.length ? (
        <div className="flex min-w-0 flex-col gap-3">
          {progress.documents.map((row) =>
            useExpandableCards ? (
              <CustomerDocumentExtractionExpandable key={row.sourceDocumentId} row={row} />
            ) : (
              <CustomerDocumentCardCompact key={row.sourceDocumentId} row={row} />
            ),
          )}
        </div>
      ) : progress && !loading ? (
        <p className={mutedText}>No documents are linked to this extraction run yet.</p>
      ) : null}
    </section>
  );
}

export function CustomerYourFilesPanel({
  caseId,
  studyRunId,
  manageFilesHref,
  pollWhileProcessing = true,
}: {
  caseId: string;
  studyRunId?: string | null;
  manageFilesHref?: string | null;
  pollWhileProcessing?: boolean;
}) {
  const trimmedStudyRunId = studyRunId?.trim() ?? "";
  const [progress, setProgress] = useState<HiveExtractionProgressView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(trimmedStudyRunId));

  const refresh = useCallback(async () => {
    if (!trimmedStudyRunId) {
      setProgress(null);
      setLoading(false);
      setError(null);
      return;
    }
    try {
      const next = await fetchHiveExtractionProgress(caseId, trimmedStudyRunId);
      setProgress(next);
      setError(null);
    } catch {
      setError("We couldn't load your uploaded files. Try refreshing this page.");
    } finally {
      setLoading(false);
    }
  }, [caseId, trimmedStudyRunId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!pollWhileProcessing || !trimmedStudyRunId) {
      return;
    }
    if (!shouldPollHiveExtractionProgress(progress)) {
      return;
    }
    const timer = window.setInterval(() => {
      void refresh();
    }, RAW_EXTRACTION_POLL_MS);
    return () => window.clearInterval(timer);
  }, [pollWhileProcessing, progress, refresh, trimmedStudyRunId]);

  if (!trimmedStudyRunId) {
    return (
      <div
        data-testid="customer-your-files-panel"
        className="rounded-2xl border border-customerHive-border bg-white px-5 py-8 text-center text-sm text-customerHive-on-surface-variant"
        role="alert"
      >
        <p className="font-medium text-customerHive-on-surface">Study link needed</p>
        <p className="mt-1">
          Return to your hive from My Hives, or open a building link that includes{" "}
          <span className="font-mono text-xs">studyRunId</span>.
        </p>
      </div>
    );
  }

  const terminalFailure =
    progress?.extractionTerminal && !progress.extractionCompleteForExplore;
  const processing = progress && shouldPollHiveExtractionProgress(progress);

  return (
    <section
      data-testid="customer-your-files-panel"
      aria-label="Your files"
      className="flex min-w-0 flex-col gap-4"
    >
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {loading && !progress ? (
        <p className="text-sm text-customerHive-on-surface-variant" aria-busy="true">
          Loading your files…
        </p>
      ) : null}

      {terminalFailure && !processing ? (
        <div
          className="rounded-[18px] border border-[#F7D3CF] bg-[#FFF9F8] px-4 py-3 text-sm text-customerHive-on-surface-variant"
          role="alert"
        >
          Document reading did not finish successfully. You can manage files below and try again.
        </div>
      ) : null}

      {progress?.documents.length ? (
        <div className="flex min-w-0 flex-col gap-3">
          {progress.documents.map((row) => (
            <CustomerDocumentCardCompact
              key={row.sourceDocumentId}
              row={row}
              showProvenance={false}
            />
          ))}
        </div>
      ) : progress && !loading ? (
        <p className="text-sm text-customerHive-on-surface-variant">
          No uploaded documents are linked to this hive yet.
        </p>
      ) : null}

      {manageFilesHref ? (
        <div className="rounded-[18px] border border-customerHive-border bg-white p-5">
          <Link
            href={manageFilesHref}
            className="inline-flex items-center gap-2 text-sm font-semibold text-customerHive-secondary hover:underline"
          >
            Manage uploaded files
          </Link>
        </div>
      ) : null}
    </section>
  );
}
