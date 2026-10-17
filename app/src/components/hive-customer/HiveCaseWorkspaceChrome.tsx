import Link from "next/link";

import {
  buildCaseCanonicalStudyHref,
  buildCaseDocumentsHref,
  buildCaseReportsHref,
  buildMyCasesHref,
  caseWorkspaceSectionLabel,
  isCaseWorkspaceSectionNavEnabled,
  type CaseWorkspaceNavInput,
  type CaseWorkspaceSection,
} from "@/lib/intake/study-completion-navigation";

function CaseWorkspaceBreadcrumbs({
  caseLabel,
  variant = "customer",
}: {
  caseLabel: string;
  variant?: "customer" | "intake";
}) {
  const isIntake = variant === "intake";
  const label = caseLabel.trim() || "Case";

  return (
    <nav
      aria-label="Case workspace"
      data-testid="case-workspace-breadcrumbs"
      className={
        isIntake
          ? "flex flex-wrap items-center gap-2 px-5 py-2.5 text-[13px] text-[#6B7280]"
          : "flex flex-wrap items-center gap-2 text-sm font-medium text-customerHive-on-surface-muted"
      }
    >
      <Link
        href={buildMyCasesHref()}
        className={
          isIntake
            ? "text-[#6B7280] hover:text-[#1F2328] hover:underline"
            : "text-customerHive-on-surface-muted hover:text-customerHive-on-surface hover:underline"
        }
      >
        My Hives
      </Link>
      <span aria-hidden className={isIntake ? "text-[#DADCE0]" : "text-customerHive-border"}>
        /
      </span>
      <span
        aria-current="page"
        className={
          isIntake ? "font-semibold text-[#1F2328]" : "font-medium text-customerHive-on-surface"
        }
      >
        {label}
      </span>
    </nav>
  );
}

const SECTIONS: Exclude<CaseWorkspaceSection, "case">[] = [
  "documents",
  "canonical-study",
  "reports",
];

function sectionHref(
  section: Exclude<CaseWorkspaceSection, "case">,
  input: CaseWorkspaceNavInput,
): string {
  switch (section) {
    case "documents":
      return buildCaseDocumentsHref(input);
    case "canonical-study":
      return buildCaseCanonicalStudyHref(input);
    case "reports":
      return buildCaseReportsHref(input);
  }
}

function CaseWorkspaceSectionNav({
  activeSection,
  variant = "customer",
  ...navInput
}: CaseWorkspaceNavInput & { activeSection: CaseWorkspaceSection; variant?: "customer" | "intake" }) {
  const isIntake = variant === "intake";

  return (
    <nav
      aria-label="Case workspace sections"
      data-testid="case-workspace-section-nav"
      className={
        isIntake
          ? "flex gap-7 overflow-x-auto border-b border-[#E3E6EA] px-5 scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:gap-7"
          : "flex gap-7 overflow-x-auto border-b border-customerHive-border scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      }
    >
      {SECTIONS.map((section) => {
        const enabled = isCaseWorkspaceSectionNavEnabled(section, navInput);
        const isActive = activeSection === section;
        const label = caseWorkspaceSectionLabel(section);
        const tabClass = isIntake
          ? "shrink-0 border-b-2 pb-3 pt-1 text-[15px] font-semibold transition-colors"
          : "shrink-0 border-b-2 pb-3 pt-1 text-[15px] font-semibold transition-colors";

        if (!enabled) {
          return (
            <span
              key={section}
              className={`${tabClass} cursor-not-allowed border-transparent text-customerHive-on-surface-muted opacity-50`}
              aria-disabled
            >
              {label}
            </span>
          );
        }

        if (isActive) {
          return (
            <span
              key={section}
              aria-current="page"
              className={`${tabClass} border-customerHive-secondary text-customerHive-on-surface`}
            >
              {label}
            </span>
          );
        }

        return (
          <Link
            key={section}
            href={sectionHref(section, navInput)}
            className={`${tabClass} border-transparent text-customerHive-on-surface-muted hover:border-customerHive-border hover:text-customerHive-on-surface ${
              isIntake ? "text-[#6B7280] hover:text-[#1F2328]" : ""
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function CaseWorkspaceChrome({
  activeSection,
  variant = "customer",
  caseLabel,
  ...navInput
}: CaseWorkspaceNavInput & { activeSection: CaseWorkspaceSection; variant?: "customer" | "intake" }) {
  const resolvedLabel = caseLabel?.trim() || "Case";
  const showSectionNav = activeSection !== "case";

  return (
    <div
      data-testid="case-workspace-chrome"
      className={
        variant === "intake"
          ? "border-b border-[#F1F3F4] bg-white"
          : "border-b border-customerHive-border bg-[#F7F8FA]"
      }
    >
      <div
        className={
          variant === "intake"
            ? "space-y-0"
            : "mx-auto w-full max-w-[1160px] space-y-3 px-4 pb-0 pt-3 md:px-8"
        }
      >
        <CaseWorkspaceBreadcrumbs caseLabel={resolvedLabel} variant={variant} />
        {showSectionNav ? (
          <CaseWorkspaceSectionNav
            activeSection={activeSection}
            variant={variant}
            caseLabel={caseLabel}
            {...navInput}
          />
        ) : null}
      </div>
    </div>
  );
}
