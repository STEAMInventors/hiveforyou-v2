export type CaseSection = "overview" | "canonical-study" | "sources";

type CaseNavigationProps = {
  active: CaseSection;
  onChange: (section: CaseSection) => void;
};

const SECTIONS: { id: CaseSection; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "canonical-study", label: "Canonical Study" },
  { id: "sources", label: "Sources" },
];

export function CaseNavigation({ active, onChange }: CaseNavigationProps) {
  return (
    <nav className="flex flex-wrap gap-2 border-b border-hive-border pb-3" aria-label="Case sections">
      {SECTIONS.map((section) => (
        <button
          key={section.id}
          type="button"
          className={`rounded-hive px-3 py-1.5 text-sm font-medium transition-colors ${
            active === section.id
              ? "bg-hive-soft-sky text-hive-navy"
              : "text-hive-text-muted hover:text-hive-navy"
          }`}
          aria-current={active === section.id ? "page" : undefined}
          onClick={() => onChange(section.id)}
        >
          {section.label}
        </button>
      ))}
    </nav>
  );
}
