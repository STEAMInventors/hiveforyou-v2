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
    : "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors";

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
      className={isIntake ? "flex flex-wrap gap-2" : "mb-8 flex flex-wrap gap-2"}
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
                  : "bg-customerHive-primary text-white"
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
                : "text-customerHive-on-surface-variant hover:bg-customerHive-surface-container hover:text-customerHive-on-surface"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
