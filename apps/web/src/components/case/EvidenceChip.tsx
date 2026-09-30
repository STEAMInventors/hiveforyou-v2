type EvidenceChipProps = {
  label: string;
  onClick: () => void;
};

export function EvidenceChip({ label, onClick }: EvidenceChipProps) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded-md border border-hive-border bg-hive-soft-sky/60 px-2 py-0.5 font-mono text-xs text-hive-blue transition-colors hover:border-hive-blue-muted hover:bg-hive-soft-sky"
      onClick={onClick}
    >
      <span aria-hidden className="text-hive-sage">
        ●
      </span>
      {label}
    </button>
  );
}
