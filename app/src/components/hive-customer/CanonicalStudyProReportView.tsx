"use client";

import { useCallback, useMemo, useState } from "react";

import type { CanonicalStudyReportProBody } from "@hiveforyou/shared/canonical-study-report-projection";

import { CanonicalStudyReportEvidenceChip } from "./CanonicalStudyReportEvidenceChip";

export function CanonicalStudyProReportView({
  body,
  studyRunId,
  exportPermitted,
}: {
  body: CanonicalStudyReportProBody;
  studyRunId: string;
  exportPermitted: boolean;
}) {
  const [exportState, setExportState] = useState<"idle" | "copied">("idle");

  const exportJson = useMemo(() => JSON.stringify(body.exportTables, null, 2), [body.exportTables]);

  const copyExport = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(exportJson);
      setExportState("copied");
      window.setTimeout(() => setExportState("idle"), 2000);
    } catch {
      setExportState("idle");
    }
  }, [exportJson]);

  return (
    <div className="space-y-10 font-mono text-sm" data-testid="canonical-study-pro-report">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-customerHive-on-surface">Structured export</h2>
          <p className="text-xs text-customerHive-on-surface-muted">studyRunId={studyRunId}</p>
        </div>
        <button
          type="button"
          onClick={() => void copyExport()}
          disabled={!exportPermitted}
          className="rounded-lg border border-customerHive-border bg-white px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          title={
            exportPermitted
              ? "Copy structured export tables"
              : "Export disabled for internal preview until pack approval permits customer/pro reports."
          }
        >
          {exportState === "copied" ? "Copied" : "Copy export tables"}
        </button>
      </section>

      <section>
        <h3 className="mb-3 text-lg font-semibold text-customerHive-on-surface">Entity / field ledger</h3>
        <div className="overflow-x-auto rounded-xl border border-customerHive-border">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-customerHive-surface-low">
              <tr>
                <th className="px-3 py-2">Entity</th>
                <th className="px-3 py-2">Record</th>
                <th className="px-3 py-2">Field</th>
                <th className="px-3 py-2">Value</th>
                <th className="px-3 py-2">Kind</th>
              </tr>
            </thead>
            <tbody>
              {body.entityLedger.map((row) => (
                <tr key={row.claimRef.fieldKey} className="border-t border-customerHive-border">
                  <td className="px-3 py-2 align-top">{row.entityId ?? "—"}</td>
                  <td className="px-3 py-2 align-top">{row.recordTypeId}</td>
                  <td className="px-3 py-2 align-top">{row.fieldId}</td>
                  <td className="px-3 py-2 align-top">{row.displayText}</td>
                  <td className="px-3 py-2 align-top">{row.assertionKind}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-lg font-semibold text-customerHive-on-surface">Source quotations</h3>
        <ul className="space-y-2">
          {body.quotations.map((quote, index) => (
            <li key={`${quote.claimRef.fieldKey}-${index}`} className="rounded-lg border border-customerHive-border bg-white px-3 py-2">
              <p className="text-xs text-customerHive-on-surface-muted">
                {quote.recordTypeId}.{quote.fieldId} · {quote.sourceDocumentId} p.{quote.page}
              </p>
              <p className="mt-1 text-sm text-customerHive-on-surface">{quote.quote}</p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-3 text-lg font-semibold text-customerHive-on-surface">Relationships</h3>
        <ul className="space-y-2">
          {body.relations.map((relation) => (
            <li key={relation.id} className="rounded-lg border border-customerHive-border bg-white px-3 py-2">
              <span className="font-medium">{relation.label}</span>{" "}
              <span className="text-customerHive-on-surface-muted">
                {relation.fieldId} · {relation.leftFieldKey} ↔ {relation.rightFieldKey}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-3 text-lg font-semibold text-customerHive-on-surface">Operative views</h3>
        <ul className="space-y-2">
          {body.operativeViews.map((view) => (
            <li key={view.id} className="rounded-lg border border-customerHive-border bg-white px-3 py-2">
              {view.baseDocumentTypeId} · {view.status} · {view.recordCount} records
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-3 text-lg font-semibold text-customerHive-on-surface">Requirements</h3>
        <ul className="space-y-2">
          {body.requirements.map((row) => (
            <li key={row.id} className="rounded-lg border border-customerHive-border bg-white px-3 py-2">
              <span className="font-medium">{row.outcome}</span> · {row.ruleId} — {row.message}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-3 text-lg font-semibold text-customerHive-on-surface">Flags</h3>
        <ul className="space-y-2">
          {body.flags.map((row) => (
            <li key={row.id} className="rounded-lg border border-customerHive-border bg-white px-3 py-2">
              <span className="font-medium">{row.status}</span> · {row.question}
              <p className="mt-1 text-customerHive-on-surface-muted">{row.message}</p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-3 text-lg font-semibold text-customerHive-on-surface">Measurement series</h3>
        <ul className="space-y-2">
          {body.measurementSeries.map((row) => (
            <li key={row.id} className="rounded-lg border border-customerHive-border bg-white px-3 py-2">
              {row.constructId} · {row.dimensionKey} · {row.observationCount} observations
            </li>
          ))}
        </ul>
      </section>

      {body.entityLedger[0]?.evidence[0] ? (
        <section>
          <h3 className="mb-3 text-lg font-semibold text-customerHive-on-surface">Evidence sample</h3>
          <CanonicalStudyReportEvidenceChip chip={body.entityLedger[0].evidence[0]!} />
        </section>
      ) : null}
    </div>
  );
}
