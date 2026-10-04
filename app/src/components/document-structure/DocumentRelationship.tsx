type DocumentRelationshipProps = {
  label?: string;
};

export function DocumentRelationship({ label }: DocumentRelationshipProps) {
  if (!label) {
    return (
      <div
        className="hidden h-6 w-px self-stretch bg-hive-border lg:block"
        aria-hidden
      />
    );
  }

  return (
    <div
      className="flex items-center gap-2 py-1 lg:flex-col lg:py-0"
      aria-hidden={!label}
    >
      <div className="hidden h-8 w-px bg-hive-border lg:block" />
      <span className="font-sans text-[10px] font-medium uppercase tracking-wide text-hive-text-muted lg:max-w-[4.5rem] lg:text-center">
        {label}
      </span>
      <div className="hidden h-8 w-px bg-hive-border lg:block" />
    </div>
  );
}
