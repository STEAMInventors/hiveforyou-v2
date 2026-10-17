"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

import Link from "next/link";

import { fetchHiveExtractionProgress } from "@/lib/hive-customer/hive-extraction-progress-client";
import { buildMyCasesHref } from "@/lib/intake/study-completion-navigation";
import type {
  CaseWorkspaceAudience,
  CaseWorkspaceSection,
} from "@/lib/intake/study-completion-navigation";

import { CaseWorkspaceChrome } from "./HiveCaseWorkspaceChrome";
import { HiveCustomerNav } from "./HiveCustomerNav";
import { HiveCustomerWordmark } from "./HiveCustomerWordmark";

export type HiveCustomerWorkspaceContext = {
  caseId: string;
  studyRunId?: string;
  intakeRunId?: string | null;
  audience?: CaseWorkspaceAudience;
  caseLabel?: string | null;
  activeSection: CaseWorkspaceSection;
};

function useCaseWorkspaceIntakeContext(caseId: string, studyRunId: string | undefined) {
  const [intakeRunId, setIntakeRunId] = useState<string | null>(null);
  const [caseLabel, setCaseLabel] = useState<string | null>(null);

  useEffect(() => {
    const trimmedStudyRunId = studyRunId?.trim();
    if (!caseId.trim() || !trimmedStudyRunId) {
      setIntakeRunId(null);
      return;
    }
    let cancelled = false;
    void fetchHiveExtractionProgress(caseId, trimmedStudyRunId)
      .then((progress) => {
        if (cancelled) {
          return;
        }
        setIntakeRunId(progress.intakeRunId);
        setCaseLabel(progress.subjectFirstName);
      })
      .catch(() => {
        if (!cancelled) {
          setIntakeRunId(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [caseId, studyRunId]);

  return { intakeRunId, caseLabel };
}

function MenuIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}

type HiveCustomerShellProps = {
  children: ReactNode;
  intakeRunId?: string | null;
  exploreHiveHref?: string | null;
  exploreDisabled?: boolean;
  workspace?: HiveCustomerWorkspaceContext;
};

export function HiveCustomerShell({ children, workspace }: HiveCustomerShellProps) {
  const resolvedIntakeFromProgress = useCaseWorkspaceIntakeContext(
    workspace?.caseId ?? "",
    workspace?.studyRunId,
  );
  const workspaceIntakeRunId =
    workspace?.intakeRunId ?? resolvedIntakeFromProgress.intakeRunId;
  const workspaceCaseLabel = workspace?.caseLabel ?? resolvedIntakeFromProgress.caseLabel;

  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const closeMobileNav = useCallback(() => {
    setMobileNavOpen(false);
  }, []);

  useEffect(() => {
    if (!mobileNavOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileNavOpen]);

  const stickyWorkspaceTop = "top-14 md:top-16";

  return (
    <div className="flex min-h-screen flex-col bg-[#F7F8FA] font-sans text-customerHive-on-surface antialiased">
      <header className="sticky top-0 z-50 border-b border-[#E8EAEE] bg-white">
        <div className="mx-auto flex h-14 max-w-[1160px] items-center gap-3 px-4 md:h-16 md:gap-7 md:px-8">
          <HiveCustomerWordmark />
          <HiveCustomerNav />
          <div className="flex-1" aria-hidden />
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-[10px] text-customerHive-on-surface md:hidden"
            aria-expanded={mobileNavOpen}
            aria-controls="hive-customer-mobile-nav"
            aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            <MenuIcon open={mobileNavOpen} />
          </button>
          <div
            className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1F2328] text-sm font-semibold text-white md:flex"
            aria-hidden
          >
            <span className="material-symbols-outlined text-[18px]">person</span>
          </div>
        </div>

        {mobileNavOpen ? (
          <>
            <button
              type="button"
              className="fixed inset-0 top-14 z-40 bg-[#1F2328]/30 md:hidden"
              aria-label="Close menu"
              onClick={closeMobileNav}
            />
            <div
              id="hive-customer-mobile-nav"
              className="absolute left-0 right-0 top-full z-50 flex max-h-[calc(100vh-3.5rem)] flex-col overflow-auto border-b border-[#E8EAEE] bg-white px-4 py-2 shadow-[0_16px_32px_rgba(31,35,40,0.12)] md:hidden"
            >
              <HiveCustomerNav variant="drawer" onNavigate={closeMobileNav} />
              <div className="mt-2 border-t border-[#EEF0F3] pt-2">
                <div className="flex items-center gap-3 px-3 py-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1F2328] text-xs font-semibold text-white">
                    <span className="material-symbols-outlined text-[16px]">person</span>
                  </span>
                  <span className="text-sm font-semibold text-customerHive-on-surface">Account</span>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </header>

      <main className="flex flex-1 flex-col">
        {workspace ? (
          <div className={`sticky ${stickyWorkspaceTop} z-40`}>
            <CaseWorkspaceChrome
              caseId={workspace.caseId}
              studyRunId={workspace.studyRunId}
              intakeRunId={workspaceIntakeRunId}
              audience={workspace.audience}
              caseLabel={workspaceCaseLabel}
              activeSection={workspace.activeSection}
            />
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}

export function CaseWorkspaceLandingExperience({
  caseId,
  studyRunId,
  intakeRunId,
  audience,
}: {
  caseId: string;
  studyRunId?: string;
  intakeRunId?: string;
  audience?: CaseWorkspaceAudience;
}) {
  return (
    <HiveCustomerShell
      workspace={{
        caseId,
        studyRunId,
        intakeRunId,
        audience,
        activeSection: "case",
      }}
    >
      <div className="mx-auto w-full max-w-[720px] px-4 py-12 md:px-8">
        <h1 className="text-2xl font-semibold text-customerHive-on-surface">Case workspace</h1>
        <p className="mt-2 text-sm text-customerHive-on-surface-variant">
          Continue from a study link with <span className="font-mono text-xs">studyRunId</span> in
          the URL, or open Documents from the section tabs when identifiers are available.
        </p>
        <p className="mt-6 font-mono text-xs text-customerHive-on-surface-muted">caseId={caseId}</p>
        <Link
          href={buildMyCasesHref()}
          className="mt-8 inline-flex rounded-[10px] bg-customerHive-secondary px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#2456B8]"
        >
          Back to My Hives
        </Link>
      </div>
    </HiveCustomerShell>
  );
}
