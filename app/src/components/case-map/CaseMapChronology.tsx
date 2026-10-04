import type { CaseMapChronologyEntry } from "@hiveforyou/shared/projections";

import { countLabel } from "@/lib/case-map/case-map-presentation";

type CaseMapChronologyProps = {
  entries: CaseMapChronologyEntry[];
  selectedClaimId?: string | null;
  onSelect: (claimId: string) => void;
};

export function CaseMapChronology({ entries, selectedClaimId, onSelect }: CaseMapChronologyProps) {
  if (!entries.length) {
    return null;
  }

  const heading = chronologyHeading(entries);

  return (
    <footer
      data-testid="case-map-chronology"
      className="relative z-20 w-full border-t border-hive-border bg-hive-surface/90 px-6 py-3 backdrop-blur-md lg:px-12"
      aria-label="Case chronology"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-2">
        <div className="flex items-center justify-between font-mono text-xs text-hive-text-muted">
          <span className="font-semibold uppercase tracking-wide">{heading}</span>
          <span>{countLabel(entries.length, "event", "events")}</span>
        </div>
        <div className="relative overflow-x-auto py-1.5">
          <div className="absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 bg-hive-border" />
          <ol className="relative flex w-max min-w-full gap-6 text-left">
            {entries.map((entry) => {
              const selected = selectedClaimId === entry.claimId;
              return (
                <li key={entry.id} className="w-52 shrink-0">
                  <button
                    type="button"
                    data-testid="case-map-chronology-item"
                    aria-current={selected ? "true" : undefined}
                    className="flex w-full min-w-0 items-center gap-2 text-left"
                    onClick={() => onSelect(entry.claimId)}
                  >
                    <span
                      className={[
                        "h-3 w-3 shrink-0 rounded-full ring-4 ring-hive-surface",
                        selected ? "bg-hive-sage" : "bg-hive-navy",
                      ].join(" ")}
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className="block font-mono text-[11px] font-bold text-hive-navy">
                        {formatChronologyDate(entry)}
                      </span>
                      <span className="block truncate font-sans text-xs text-hive-text-muted">
                        {entry.label}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </footer>
  );
}

function chronologyHeading(entries: CaseMapChronologyEntry[]): string {
  const years: number[] = [];
  for (const entry of entries) {
    const match = entry.occurredOn?.match(/^(\d{4})/);
    if (match?.[1]) {
      years.push(Number(match[1]));
    }
  }
  if (!years.length) {
    return "Chronology";
  }
  const min = Math.min(...years);
  const max = Math.max(...years);
  return min === max ? `Chronology (${min})` : `Chronology (${min}–${max})`;
}

function formatChronologyDate(entry: CaseMapChronologyEntry): string {
  if (entry.occurredOn?.trim()) {
    return entry.occurredOn.trim();
  }
  return "Date unknown";
}
