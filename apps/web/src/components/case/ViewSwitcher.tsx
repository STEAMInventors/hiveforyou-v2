export type CaseViewMode = "customer" | "pro";

type ViewSwitcherProps = {
  mode: CaseViewMode;
  onChange: (mode: CaseViewMode) => void;
};

export function ViewSwitcher({ mode, onChange }: ViewSwitcherProps) {
  return (
    <div
      className="inline-flex rounded-hive-lg border border-hive-border bg-hive-surface p-1 shadow-hive"
      role="tablist"
      aria-label="View mode"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === "customer"}
        className={`rounded-hive px-4 py-2 text-sm font-medium transition-colors ${
          mode === "customer"
            ? "bg-hive-navy text-hive-text-inverse"
            : "text-hive-text-muted hover:text-hive-navy"
        }`}
        onClick={() => onChange("customer")}
      >
        Customer
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "pro"}
        className={`rounded-hive px-4 py-2 text-sm font-medium transition-colors ${
          mode === "pro"
            ? "bg-hive-navy text-hive-text-inverse"
            : "text-hive-text-muted hover:text-hive-navy"
        }`}
        onClick={() => onChange("pro")}
      >
        Pro
      </button>
    </div>
  );
}
