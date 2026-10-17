import Link from "next/link";

import { buildMyCasesHref } from "@/lib/intake/study-completion-navigation";

type HiveCustomerNavProps = {
  /** When true, render links for the mobile drawer (larger tap targets). */
  variant?: "header" | "drawer";
  onNavigate?: () => void;
};

/**
 * Global app navigation — My Hives only. Workspace sections (Documents, Canonical Study,
 * Reports) live exclusively in {@link CaseWorkspaceChrome}.
 */
export function HiveCustomerNav({ variant = "header", onNavigate }: HiveCustomerNavProps) {
  const href = buildMyCasesHref();
  const isDrawer = variant === "drawer";

  if (isDrawer) {
    return (
      <nav className="flex flex-col gap-1" aria-label="Application">
        <Link
          href={href}
          onClick={onNavigate}
          className="flex min-h-[50px] items-center rounded-[10px] px-3 text-base font-semibold text-customerHive-on-surface transition-colors hover:bg-customerHive-surface-low"
        >
          My Hives
        </Link>
      </nav>
    );
  }

  return (
    <nav className="hidden items-center gap-1 md:flex" aria-label="Application">
      <Link
        href={href}
        className="rounded-[9px] px-3.5 py-2 text-[14.5px] font-semibold text-customerHive-secondary transition-colors hover:bg-[#EEF4FF] hover:text-[#2456B8]"
      >
        My Hives
      </Link>
    </nav>
  );
}
