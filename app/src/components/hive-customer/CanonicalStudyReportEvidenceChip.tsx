"use client";

import type { CanonicalStudyReportEvidenceChip as EvidenceChipModel } from "@hiveforyou/shared/canonical-study-report-projection";

export function CanonicalStudyReportEvidenceChip({
  chip,
  onSelect,
}: {
  chip: EvidenceChipModel;
  onSelect?: (chip: EvidenceChipModel) => void;
}) {
  const label = `p.${chip.page}`;
  const title = chip.quote;
  if (onSelect) {
    return (
      <button
        type="button"
        className="inline-flex max-w-full items-center gap-1 rounded-md border border-customerHive-border bg-customerHive-surface-low px-2 py-0.5 text-xs text-customerHive-on-surface"
        title={title}
        onClick={() => onSelect(chip)}
      >
        <span className="font-medium text-customerHive-primary">{label}</span>
        <span className="truncate">{chip.quote.slice(0, 48)}{chip.quote.length > 48 ? "…" : ""}</span>
      </button>
    );
  }
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded-md border border-customerHive-border bg-customerHive-surface-low px-2 py-0.5 text-xs text-customerHive-on-surface"
      title={title}
    >
      <span className="font-medium text-customerHive-primary">{label}</span>
      <span className="truncate">{chip.quote.slice(0, 48)}{chip.quote.length > 48 ? "…" : ""}</span>
    </span>
  );
}
