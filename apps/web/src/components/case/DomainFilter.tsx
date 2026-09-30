import { domainAccentColor, domainLabel } from "@/lib/case/domain-display";

type DomainFilterProps = {
  domainIds: string[];
  selectedDomainId: string | null;
  onSelect: (domainId: string | null) => void;
};

export function DomainFilter({ domainIds, selectedDomainId, onSelect }: DomainFilterProps) {
  if (domainIds.length <= 1) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by domain">
      <FilterChip
        label="All domains"
        active={selectedDomainId === null}
        onClick={() => onSelect(null)}
      />
      {domainIds.map((domainId) => (
        <FilterChip
          key={domainId}
          label={domainLabel(domainId)}
          accent={domainAccentColor(domainId)}
          active={selectedDomainId === domainId}
          onClick={() => onSelect(domainId)}
        />
      ))}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
  accent,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  accent?: string;
}) {
  return (
    <button
      type="button"
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-hive-navy bg-hive-navy text-hive-text-inverse"
          : "border-hive-border bg-hive-surface text-hive-text-muted hover:border-hive-blue hover:text-hive-navy"
      }`}
      style={!active && accent ? { borderColor: accent, color: accent } : undefined}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
