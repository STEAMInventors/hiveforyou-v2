import Link from "next/link";

import {
  caseDocumentsViewLabel,
  type CaseDocumentsView,
} from "@/lib/intake/study-completion-navigation";

export function CaseDocumentsSubNav({
  activeView,
  filesHref,
  rawExtractionsHref,
  rawExtractionsEnabled = true,
  variant = "customer",
}: {
  activeView: CaseDocumentsView;
  filesHref: string;
  rawExtractionsHref: string;
  rawExtractionsEnabled?: boolean;
  variant?: "customer" | "intake";
}) {
  const isIntake = variant === "intake";
  const baseClass = isIntake
    ? "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors"
    : "-mb-px border-b-2 border-transparent px-0 pb-3 pt-1 text-[15px] font-semibold transition-colors";

  const tabs: Array<{ id: CaseDocumentsView; href: string; enabled: boolean }> = [
    { id: "files", href: filesHref, enabled: true },
    {
      id: "raw-extractions",
      href: rawExtractionsHref,
      enabled: rawExtractionsEnabled,
    },
  ];

  return (
    <nav
      aria-label="Documents views"
      data-testid="case-documents-sub-nav"
      className={
        isIntake
          ? "flex flex-wrap gap-2"
          : "mb-6 flex min-w-0 flex-wrap gap-7 overflow-x-auto border-b border-customerHive-border scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      }
    >
      {tabs.map((tab) => {
        const isActive = activeView === tab.id;
        const label = caseDocumentsViewLabel(tab.id);

        if (!tab.enabled) {
          return (
            <span
              key={tab.id}
              className={`${baseClass} cursor-not-allowed opacity-50 ${
                isIntake ? "text-[#9AA0A6]" : "text-customerHive-on-surface-muted"
              }`}
              aria-disabled
            >
              {label}
            </span>
          );
        }

        if (isActive) {
          return (
            <span
              key={tab.id}
              aria-current="page"
              className={`${baseClass} ${
                isIntake
                  ? "bg-[#E8F0FE] text-[#1A56C4]"
                  : "border-customerHive-secondary text-customerHive-on-surface"
              }`}
            >
              {label}
            </span>
          );
        }

        return (
          <Link
            key={tab.id}
            href={tab.href}
            className={`${baseClass} ${
              isIntake
                ? "text-[#5F6368] hover:bg-[#F8F9FA] hover:text-[#0D0D0D]"
                : "text-customerHive-on-surface-muted hover:border-customerHive-border hover:text-customerHive-on-surface"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
