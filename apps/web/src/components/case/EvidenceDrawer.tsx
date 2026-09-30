import { X } from "lucide-react";

import type { ResolvedEvidenceRef } from "@hiveforyou/shared/projections";

import { domainLabel } from "@/lib/case/domain-display";

type EvidenceDrawerProps = {
  claimStatement?: string;
  evidence: ResolvedEvidenceRef[];
  onClose: () => void;
};

export function EvidenceDrawer({ claimStatement, evidence, onClose }: EvidenceDrawerProps) {
  if (!evidence.length) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-hive-navy/20 lg:hidden"
        aria-label="Close evidence"
        onClick={onClose}
      />
      <aside
        data-testid="evidence-drawer"
        className="fixed bottom-0 left-0 right-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-hive-xl border border-hive-border bg-hive-surface p-5 shadow-hive-lg lg:static lg:max-h-none lg:w-96 lg:shrink-0 lg:rounded-hive-xl"
        aria-label="Evidence details"
      >
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
        <ul className="space-y-4">
          {evidence.map((ref) => (
            <li
              key={ref.id}
              className="rounded-hive-lg border border-hive-border bg-hive-page/50 p-3"
            >
              <dl className="space-y-2 font-sans text-sm">
                <Row label="Document" value={ref.logicalTitle ?? ref.sourceFilename ?? ref.sourceDocumentId} />
                {ref.logicalDocumentType ? (
                  <Row label="Type" value={ref.logicalDocumentType} />
                ) : null}
                {ref.logicalDomainId ? (
                  <Row label="Domain" value={domainLabel(ref.logicalDomainId)} />
                ) : null}
                {ref.page != null ? (
                  <Row
                    label="Page"
                    value={
                      ref.pageEnd && ref.pageEnd !== ref.page
                        ? `${ref.page}–${ref.pageEnd}`
                        : String(ref.page)
                    }
                  />
                ) : null}
                {ref.sha256 ? <Row label="SHA-256" value={ref.sha256} mono /> : null}
              </dl>
            </li>
          ))}
        </ul>
      </aside>
    </>
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
