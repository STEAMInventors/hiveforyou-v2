import Link from "next/link";

import {
  buildCaseCanonicalStudyHref,
  buildCaseDocumentsHref,
  buildCaseReportsHref,
  buildCaseWorkspaceHomeHref,
  buildMyCasesHref,
  caseWorkspaceSectionLabel,
  isCaseWorkspaceSectionNavEnabled,
  type CaseWorkspaceNavInput,
  type CaseWorkspaceSection,
} from "@/lib/intake/study-completion-navigation";

type Crumb = {
  id: CaseWorkspaceSection | "my-cases";
  label: string;
  href: string | null;
};

function buildCrumbs(input: CaseWorkspaceNavInput): Crumb[] {
  const caseLabel = input.caseLabel?.trim() || "Case";

  return [
    { id: "my-cases", label: "My Cases", href: buildMyCasesHref() },
    { id: "case", label: caseLabel, href: buildCaseWorkspaceHomeHref(input) },
    {
      id: "documents",
      label: caseWorkspaceSectionLabel("documents"),
      href: buildCaseDocumentsHref(input),
    },
    {
      id: "canonical-study",
      label: caseWorkspaceSectionLabel("canonical-study"),
      href: buildCaseCanonicalStudyHref(input),
    },
    {
      id: "reports",
      label: caseWorkspaceSectionLabel("reports"),
      href: buildCaseReportsHref(input),
    },
  ];
}

function CaseWorkspaceBreadcrumbs({
  activeSection,
  variant = "customer",
  ...navInput
}: CaseWorkspaceNavInput & { activeSection: CaseWorkspaceSection; variant?: "customer" | "intake" }) {
  const crumbs = buildCrumbs(navInput);
  const isIntake = variant === "intake";

  return (
    <nav
      aria-label="Case workspace"
      data-testid="case-workspace-breadcrumbs"
      className={
        isIntake
          ? "flex flex-wrap items-center gap-1.5 px-5 py-2.5 text-[13px] text-[#5F6368]"
          : "flex flex-wrap items-center gap-1.5 text-sm text-customerHive-on-surface-variant"
      }
    >
      {crumbs.map((crumb, index) => {
        const isCurrent = crumb.id === activeSection;
        return (
          <span key={crumb.id} className="inline-flex items-center gap-1.5">
            {index > 0 ? (
              <span
                className={isIntake ? "text-[#DADCE0]" : "text-customerHive-on-surface-muted"}
                aria-hidden
              >
                /
              </span>
            ) : null}
            {isCurrent || !crumb.href ? (
              <span
                aria-current={isCurrent ? "page" : undefined}
                className={
                  isCurrent
                    ? isIntake
                      ? "font-semibold text-[#0D0D0D]"
                      : "font-medium text-customerHive-on-surface"
                    : isIntake
                      ? "text-[#5F6368]"
                      : "text-customerHive-on-surface-variant"
                }
              >
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className={
                  isIntake
                    ? "font-medium text-[#1A56C4] hover:underline"
                    : "font-medium text-customerHive-primary hover:underline"
                }
              >
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
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
          ? "flex flex-wrap gap-2 border-b border-[#F1F3F4] px-5 pb-3"
          : "flex flex-wrap gap-2 border-b border-customerHive-border pb-3"
      }
    >
      {SECTIONS.map((section) => {
        const enabled = isCaseWorkspaceSectionNavEnabled(section, navInput);
        const isActive = activeSection === section;
        const label = caseWorkspaceSectionLabel(section);
        const baseClass = isIntake
          ? "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors"
          : "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors";

        if (!enabled) {
          return (
            <span
              key={section}
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
              key={section}
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
            key={section}
            href={sectionHref(section, navInput)}
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

export function CaseWorkspaceChrome({
  activeSection,
  variant = "customer",
  ...navInput
}: CaseWorkspaceNavInput & { activeSection: CaseWorkspaceSection; variant?: "customer" | "intake" }) {
  return (
    <div
      data-testid="case-workspace-chrome"
      className={
        variant === "intake"
          ? "border-b border-[#F1F3F4] bg-white"
          : "border-b border-customerHive-border bg-customerHive-surface-low"
      }
    >
      <div className={variant === "intake" ? "" : "mx-auto w-full max-w-[1440px] px-6 lg:px-10"}>
        <CaseWorkspaceBreadcrumbs activeSection={activeSection} variant={variant} {...navInput} />
        <CaseWorkspaceSectionNav activeSection={activeSection} variant={variant} {...navInput} />
      </div>
    </div>
  );
}
