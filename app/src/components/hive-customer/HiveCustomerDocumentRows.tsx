import {
  customerStatusLabel,
  type CustomerExtractionDocumentRow,
} from "@/lib/hive-customer/map-customer-extraction-ui-state";

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
