"use client";

import { useEffect, useState, type ReactNode } from "react";

import { fetchHiveExtractionProgress } from "@/lib/hive-customer/hive-extraction-progress-client";
import type {
  CaseWorkspaceAudience,
  CaseWorkspaceSection,
} from "@/lib/intake/study-completion-navigation";

import Link from "next/link";

import { buildMyCasesHref } from "@/lib/intake/study-completion-navigation";

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

type HiveCustomerShellProps = {
  children: ReactNode;
  intakeRunId?: string | null;
  exploreHiveHref?: string | null;
  exploreDisabled?: boolean;
  workspace?: HiveCustomerWorkspaceContext;
};

export function HiveCustomerShell({
  children,
  intakeRunId,
  exploreHiveHref,
  exploreDisabled,
  workspace,
}: HiveCustomerShellProps) {
  const resolvedIntakeFromProgress = useCaseWorkspaceIntakeContext(
    workspace?.caseId ?? "",
    workspace?.studyRunId,
  );
  const workspaceIntakeRunId =
    workspace?.intakeRunId ?? intakeRunId ?? resolvedIntakeFromProgress.intakeRunId;
  const workspaceCaseLabel = workspace?.caseLabel ?? resolvedIntakeFromProgress.caseLabel;

  return (
    <div className="flex min-h-screen flex-col bg-customerHive-surface font-sans text-customerHive-on-surface antialiased">
      <header className="fixed left-0 top-0 z-50 w-full border-b border-customerHive-border bg-customerHive-surface-lowest">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-6 lg:px-10">
          <div className="flex items-center gap-6">
            <HiveCustomerWordmark />
            <HiveCustomerNav
              intakeRunId={workspaceIntakeRunId ?? intakeRunId}
              exploreHiveHref={exploreHiveHref}
              exploreDisabled={exploreDisabled}
            />
          </div>
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full bg-customerHive-primary"
            aria-hidden
          >
            <span className="material-symbols-outlined text-[18px] text-white">person</span>
          </div>
        </div>
      </header>
      <main className="flex flex-1 flex-col pt-16">
        {workspace ? (
          <div className="sticky top-16 z-40">
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
      <div className="mx-auto w-full max-w-[720px] px-6 py-12 lg:px-10">
        <h1 className="text-2xl font-semibold text-customerHive-on-surface">Case workspace</h1>
        <p className="mt-2 text-sm text-customerHive-on-surface-variant">
          Continue from a study link with <span className="font-mono text-xs">studyRunId</span> in
          the URL, or open Documents from the section tabs when identifiers are available.
        </p>
        <p className="mt-6 font-mono text-xs text-customerHive-on-surface-muted">caseId={caseId}</p>
        <Link
          href={buildMyCasesHref()}
          className="mt-8 inline-flex rounded-lg bg-customerHive-primary px-4 py-2 text-sm font-medium text-white"
        >
          Back to My Cases
        </Link>
      </div>
    </HiveCustomerShell>
  );
}
