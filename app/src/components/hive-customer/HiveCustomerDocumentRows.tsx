"use client";

import { isStudyRunProcessing } from "@hiveforyou/shared/canonical-study";
import { useCallback, useEffect, useState } from "react";

import { fetchHiveExtractionProgress } from "@/lib/hive-customer/hive-extraction-progress-client";
import type { HiveExtractionProgressView } from "@/lib/hive-customer/hive-extraction-progress-types";
import {
  customerStatusLabel,
  type CustomerExtractionDocumentRow,
} from "@/lib/hive-customer/map-customer-extraction-ui-state";

const RAW_EXTRACTION_POLL_MS = 2500;

function ReadCheckIcon() {
  return (
    <svg
      aria-hidden
      className="shrink-0"
      fill="none"
      height="14"
      viewBox="0 0 14 14"
      width="14"
    >
      <path
        d="M11.6666 3.5L5.24992 9.91667L2.33325 7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
      />
    </svg>
  );
}

function statusDetail(row: CustomerExtractionDocumentRow): string {
  if (row.uiStatus === "read" && row.detailCount != null) {
    return `Read · ${row.detailCount} details`;
  }
  return customerStatusLabel(row.uiStatus);
}

function ProvenanceBlock({ row }: { row: CustomerExtractionDocumentRow }) {
  if (!row.provenance) {
    return null;
  }
  return (
    <div className="mb-1 mt-2.5 flex flex-wrap items-center gap-2.5 pl-5">
      <span className="text-sm leading-5 text-customerHive-on-surface">{row.provenance.text}</span>
      <span className="inline-flex select-none items-center rounded-[7px] bg-customerHive-honey-chip px-2 py-[3px] font-mono text-[12.5px] leading-tight text-customerHive-on-surface">
        {row.provenance.chipLabel}
      </span>
    </div>
  );
}

export function HiveCustomerDocumentRowsBuilding({
  documents,
}: {
  documents: CustomerExtractionDocumentRow[];
}) {
  return (
    <div className="flex w-full flex-col bg-customerHive-surface-lowest">
      {documents.map((row) => {
        const isRead = row.uiStatus === "read";
        const statusColor =
          row.uiStatus === "failed"
            ? "text-red-700"
            : row.uiStatus === "needs_review"
              ? "text-amber-800"
              : isRead
                ? "text-customerHive-primary-read"
                : "text-customerHive-on-surface-muted";
        return (
          <div key={row.sourceDocumentId} className="border-b border-customerHive-border py-3.5">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-base leading-[22px] text-customerHive-on-surface">
                  {row.label}
                </span>
                {row.dateLabel ? (
                  <span className="text-sm leading-5 text-customerHive-on-surface-muted">
                    {row.dateLabel}
                  </span>
                ) : null}
              </div>
              <div className={`flex items-center gap-1.5 text-sm font-medium leading-5 ${statusColor}`}>
                {isRead ? <ReadCheckIcon /> : null}
                <span>{statusDetail(row)}</span>
              </div>
            </div>
            {isRead ? <ProvenanceBlock row={row} /> : null}
          </div>
        );
      })}
    </div>
  );
}

export function HiveCustomerDocumentRowsReady({
  documents,
}: {
  documents: CustomerExtractionDocumentRow[];
}) {
  return (
    <div className="flex flex-col space-y-2">
      {documents.map((row) => {
        const isRead = row.uiStatus === "read";
        return (
          <div
            key={row.sourceDocumentId}
            className="flex flex-col rounded-xl bg-customerHive-surface-lowest p-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {isRead ? (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-customerHive-primary-fixed">
                    <span
                      className="material-symbols-outlined text-[17px] text-customerHive-primary"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      check
                    </span>
                  </div>
                ) : (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-customerHive-surface-container">
                    <span className="text-xs font-medium text-customerHive-on-surface-muted">
                      …
                    </span>
                  </div>
                )}
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-customerHive-on-surface">{row.label}</span>
                  {row.dateLabel ? (
                    <span className="text-sm text-customerHive-on-surface-muted">{row.dateLabel}</span>
                  ) : null}
                </div>
              </div>
              <span className="text-xs text-customerHive-on-surface-muted">{statusDetail(row)}</span>
            </div>
            {isRead && row.provenance ? (
              <div className="ml-11 mt-3 flex flex-col justify-between gap-2 rounded-lg bg-customerHive-surface-low pt-3 pl-3 md:flex-row md:items-center">
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined mt-0.5 text-[16px] text-customerHive-on-surface-muted">
                    subdirectory_arrow_right
                  </span>
                  <span className="font-serif text-sm leading-snug text-customerHive-on-surface">
                    {row.provenance.text}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 self-start rounded bg-customerHive-tertiary-fixed px-2 py-1 font-mono text-xs md:self-auto">
                  <span className="material-symbols-outlined text-[13px]">description</span>
                  {row.provenance.chipLabel}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function CustomerRawExtractionDocumentCard({ row }: { row: CustomerExtractionDocumentRow }) {
  const isRead = row.uiStatus === "read";
  const statusLabel = customerStatusLabel(row.uiStatus);

  return (
    <article
      className="flex flex-col rounded-xl border border-customerHive-border bg-customerHive-surface-lowest p-4 shadow-sm"
      data-testid="customer-raw-extraction-document"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-customerHive-on-surface">{row.label}</h3>
          {row.dateLabel ? (
            <p className="text-sm text-customerHive-on-surface-muted">{row.dateLabel}</p>
          ) : null}
        </div>
        <span
          className={`text-xs font-medium ${
            row.uiStatus === "failed"
              ? "text-red-700"
              : row.uiStatus === "needs_review"
                ? "text-amber-800"
                : isRead
                  ? "text-customerHive-primary-read"
                  : "text-customerHive-on-surface-muted"
          }`}
        >
          {statusLabel}
          {isRead && row.detailCount != null ? ` · ${row.detailCount} details` : null}
        </span>
      </header>

      {isRead && row.extractedDetails.length > 0 ? (
        <dl className="mt-4 space-y-3 border-t border-customerHive-border pt-4">
          {row.extractedDetails.map((detail) => (
            <div key={`${detail.label}-${detail.value}`} className="space-y-1">
              <dt className="text-xs font-medium uppercase tracking-wide text-customerHive-on-surface-muted">
                {detail.label}
              </dt>
              <dd className="text-sm text-customerHive-on-surface">{detail.value}</dd>
              {detail.provenance ? (
                <dd className="mt-1 flex flex-wrap items-center gap-2 text-sm text-customerHive-on-surface-variant">
                  <span className="font-serif leading-snug">{detail.provenance.text}</span>
                  <span className="inline-flex items-center rounded bg-customerHive-tertiary-fixed px-2 py-0.5 font-mono text-xs">
                    {detail.provenance.chipLabel}
                  </span>
                </dd>
              ) : null}
            </div>
          ))}
        </dl>
      ) : null}

      {isRead && row.provenance && row.extractedDetails.length === 0 ? (
        <p className="mt-3 text-sm text-customerHive-on-surface-variant">
          {row.provenance.text}
          <span className="ml-2 inline-flex rounded bg-customerHive-tertiary-fixed px-2 py-0.5 font-mono text-xs">
            {row.provenance.chipLabel}
          </span>
        </p>
      ) : null}
    </article>
  );
}

export function CustomerRawExtractionsPanel({
  caseId,
  studyRunId,
  variant = "customer",
  presentation = "detailed",
  pollWhileProcessing = true,
}: {
  caseId: string;
  studyRunId?: string | null;
  variant?: "customer" | "intake";
  presentation?: "summary" | "detailed";
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
    const stillProcessing =
      progress &&
      (isStudyRunProcessing(progress.studyRunStatus) ||
        (!progress.extractionTerminal && !progress.extractionCompleteForExplore));
    if (!stillProcessing) {
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
        data-testid="customer-raw-extractions-panel"
        className={
          variant === "intake"
            ? "rounded-xl border border-[#E8EAED] bg-[#F8F9FA] px-5 py-8 text-center text-sm text-[#5F6368]"
            : "rounded-xl border border-customerHive-border bg-customerHive-surface-low px-5 py-8 text-center text-sm text-customerHive-on-surface-variant"
        }
      >
        <p className="font-medium text-customerHive-on-surface">No extractions yet</p>
        <p className="mt-1">
          After you start reading documents, extracted details will appear here for review.
        </p>
      </div>
    );
  }

  const terminalFailure =
    progress?.extractionTerminal && !progress.extractionCompleteForExplore;
  const processing =
    progress &&
    (isStudyRunProcessing(progress.studyRunStatus) ||
      (!progress.extractionTerminal && !progress.extractionCompleteForExplore));
  const showDetailedCards = presentation === "detailed" && progress?.extractionCompleteForExplore;

  return (
    <section
      data-testid="customer-raw-extractions-panel"
      aria-label="Raw extractions"
      className="space-y-6"
    >
      <p
        className={
          variant === "intake"
            ? "text-sm text-[#5F6368]"
            : "text-sm text-customerHive-on-surface-variant"
        }
      >
        Review what was read from each document. These details come from source pages and are not
        yet validated for reporting.
      </p>

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {loading && !progress ? (
        <p
          className={
            variant === "intake"
              ? "text-sm text-[#5F6368]"
              : "text-sm text-customerHive-on-surface-muted"
          }
          aria-busy="true"
        >
          Loading extractions…
        </p>
      ) : null}

      {terminalFailure ? (
        <div
          className={
            variant === "intake"
              ? "rounded-xl border border-[#FCE8E6] bg-[#FCE8E6] px-4 py-3 text-sm text-[#5F2120]"
              : "rounded-xl border border-customerHive-border bg-customerHive-surface-low px-4 py-3 text-sm text-customerHive-on-surface-variant"
          }
          role="alert"
        >
          Extraction did not finish successfully for every document. You can return to your files
          to try again or add more documents.
        </div>
      ) : null}

      {processing && !terminalFailure ? (
        <p
          className={
            variant === "intake"
              ? "text-sm text-[#1A56C4]"
              : "text-sm text-customerHive-primary"
          }
          role="status"
        >
          Still reading your documents…
        </p>
      ) : null}

      {progress?.documents.length ? (
        showDetailedCards ? (
          <div className="flex flex-col gap-3">
            {progress.documents.map((row) => (
              <CustomerRawExtractionDocumentCard key={row.sourceDocumentId} row={row} />
            ))}
          </div>
        ) : progress.extractionCompleteForExplore ? (
          <HiveCustomerDocumentRowsReady documents={progress.documents} />
        ) : (
          <HiveCustomerDocumentRowsBuilding documents={progress.documents} />
        )
      ) : progress && !loading ? (
        <p
          className={
            variant === "intake"
              ? "text-sm text-[#5F6368]"
              : "text-sm text-customerHive-on-surface-muted"
          }
        >
          No documents are linked to this extraction run yet.
        </p>
      ) : null}
    </section>
  );
}
