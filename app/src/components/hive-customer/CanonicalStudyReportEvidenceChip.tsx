"use client";

import type { CanonicalStudyReportEvidenceChip as EvidenceChipModel } from "@hiveforyou/shared/canonical-study-report-projection";

export function CanonicalStudyReportEvidenceChip({
  chip,
  onSelect,
  variant = "default",
  citationNumber,
}: {
  chip: EvidenceChipModel;
  onSelect?: (chip: EvidenceChipModel) => void;
  variant?: "default" | "inverted";
  /** Numbered source citation (Living Case). */
  citationNumber?: number;
}) {
  const label =
    citationNumber != null ? `${citationNumber}` : `p.${chip.page}`;
  const title = chip.quote;
  const snippet = `${chip.quote.slice(0, 48)}${chip.quote.length > 48 ? "…" : ""}`;
  const defaultClass =
    "inline-flex max-w-full items-center gap-1 rounded-md border border-customerHive-border bg-customerHive-surface-low px-2 py-0.5 text-xs text-customerHive-on-surface";
  const invertedClass = "hir-evidence-chip";
  const className = variant === "inverted" ? invertedClass : defaultClass;

  if (onSelect) {
    return (
      <button
        type="button"
        className={className}
        title={title}
        data-testid="hive-ui-evidence-chip"
        onClick={() => onSelect(chip)}
      >
        {variant === "inverted" ? (
          <>
            <span
              className={
                citationNumber != null
                  ? "hir-evidence-chip__citation"
                  : "hir-evidence-chip__page"
              }
            >
              {label}
            </span>
            <span className="truncate">{snippet}</span>
          </>
        ) : (
          <>
            <span className="font-medium text-customerHive-primary">{label}</span>
            <span className="truncate">{snippet}</span>
          </>
        )}
      </button>
    );
  }
  return (
    <span className={className} title={title} data-testid="hive-ui-evidence-chip">
      {variant === "inverted" ? (
        <>
          <span
            className={
              citationNumber != null ? "hir-evidence-chip__citation" : "hir-evidence-chip__page"
            }
          >
            {label}
          </span>
          <span className="truncate">{snippet}</span>
        </>
      ) : (
        <>
          <span className="font-medium text-customerHive-primary">{label}</span>
          <span className="truncate">{snippet}</span>
        </>
      )}
    </span>
  );
}
