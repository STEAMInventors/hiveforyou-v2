import Link from "next/link";

type HiveCustomerNavProps = {
  intakeRunId?: string | null;
  exploreHiveHref?: string | null;
  exploreDisabled?: boolean;
};

export function HiveCustomerNav({
  intakeRunId,
  exploreHiveHref,
  exploreDisabled = true,
}: HiveCustomerNavProps) {
  const documentsHref = intakeRunId
    ? `/intake/${encodeURIComponent(intakeRunId)}`
    : null;

  return (
    <nav className="hidden items-center gap-1 md:flex" aria-label="Hive journey">
      <Link
        href="/case"
        className="rounded-lg px-4 py-1 text-sm font-medium text-customerHive-on-surface-variant transition-colors hover:bg-customerHive-surface-container hover:text-customerHive-on-surface"
      >
        My Hives
      </Link>
      {documentsHref ? (
        <Link
          href={documentsHref}
          className="rounded-lg px-4 py-1 text-sm font-medium text-customerHive-on-surface-variant transition-colors hover:bg-customerHive-surface-container hover:text-customerHive-on-surface"
        >
          Documents
        </Link>
      ) : (
        <span className="cursor-not-allowed px-4 py-1 text-sm font-medium text-customerHive-on-surface-muted">
          Documents
        </span>
      )}
      {exploreHiveHref && !exploreDisabled ? (
        <Link
          href={exploreHiveHref}
          className="rounded-lg px-4 py-1 text-sm font-medium text-customerHive-on-surface-variant transition-colors hover:bg-customerHive-surface-container hover:text-customerHive-on-surface"
        >
          Explore Hive
        </Link>
      ) : (
        <span
          className="cursor-not-allowed px-4 py-1 text-sm font-medium text-customerHive-on-surface-muted"
          aria-disabled
        >
          Explore Hive
        </span>
      )}
    </nav>
  );
}
