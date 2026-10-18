"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { fetchHiveExtractionProgress } from "@/lib/hive-customer/hive-extraction-progress-client";
import type { HiveExtractionProgressView } from "@/lib/hive-customer/hive-extraction-progress-types";
import {
  buildCaseDocumentsSubNavHrefs,
  buildHiveReadyHref,
  buildIntakeDocumentsSectionHref,
  type CaseDocumentsView,
} from "@/lib/intake/study-completion-navigation";

import {
  customerExtractionShowsGenericFailure,
  shouldPollHiveExtractionProgress,
} from "@/lib/hive-customer/hive-extraction-progress-types";

import { CaseDocumentsSubNav } from "./CaseDocumentsSubNav";
import { CustomerRawExtractionsPanel, CustomerYourFilesPanel } from "./HiveCustomerDocumentRows";
import { HiveCustomerShell } from "./HiveCustomerShell";

const POLL_MS = 2500;

export function HiveBuildingProgressExperience({
  caseId,
  studyRunId,
  documentsView = "raw-extractions",
}: {
  caseId: string;
  studyRunId: string;
  documentsView?: CaseDocumentsView;
}) {
  const router = useRouter();
  const [progress, setProgress] = useState<HiveExtractionProgressView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchHiveExtractionProgress(caseId, studyRunId);
      setProgress(next);
      setError(null);
      if (next.extractionCompleteForExplore) {
        router.replace(buildHiveReadyHref({ caseId, studyRunId }));
      }
    } catch {
      setError("We couldn't load extraction progress. Try refreshing this page.");
    }
  }, [caseId, router, studyRunId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!studyRunId.trim()) {
      return;
    }
    if (!shouldPollHiveExtractionProgress(progress)) {
      return;
    }
    const timer = window.setInterval(() => {
      void refresh();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [progress, refresh, studyRunId]);

  const showGenericFailure = customerExtractionShowsGenericFailure(progress);
  const intakeRunId = progress?.intakeRunId ?? null;
  const { filesHref, rawExtractionsHref } = buildCaseDocumentsSubNavHrefs({
    caseId,
    studyRunId,
    intakeRunId,
    segment: "building",
  });
  const manageFilesHref = intakeRunId
    ? buildIntakeDocumentsSectionHref({ intakeRunId, studyRunId, view: "files" })
    : null;

  return (
    <HiveCustomerShell
      intakeRunId={progress?.intakeRunId}
      exploreDisabled
      workspace={{
        caseId,
        studyRunId,
        intakeRunId: progress?.intakeRunId,
        caseLabel: progress?.subjectFirstName,
        activeSection: "documents",
      }}
    >
      <div className="mx-auto flex w-full min-w-0 max-w-[1160px] flex-1 flex-col px-5 py-8 sm:px-8 sm:py-9 lg:px-8">
        <CaseDocumentsSubNav
          activeView={documentsView}
          filesHref={filesHref}
          rawExtractionsHref={rawExtractionsHref}
        />

        {documentsView === "files" ? (
          <section className="flex min-w-0 flex-col gap-6 pt-2">
            <header className="flex flex-col gap-1">
              <h1
                className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-customerHive-on-surface sm:text-[28px]"
                style={{ fontFamily: "var(--font-outfit), sans-serif" }}
              >
                Your files
              </h1>
              <p className="text-base text-customerHive-on-surface-variant">
                While documents are being read, you can still add or adjust files.
              </p>
            </header>
            <CustomerYourFilesPanel
              caseId={caseId}
              studyRunId={studyRunId}
              manageFilesHref={manageFilesHref}
            />
          </section>
        ) : (
          <section
            aria-label="Document ingestion status"
            className="flex min-w-0 flex-col gap-6 pt-2"
          >
            <header className="flex flex-col gap-1">
              <h1
                className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-customerHive-on-surface sm:text-[28px]"
                style={{ fontFamily: "var(--font-outfit), sans-serif" }}
              >
                Raw extractions
              </h1>
              <p className="text-[15px] text-customerHive-on-surface-muted">
                Live status while your documents are being read.
              </p>
            </header>

            {error ? (
              <p className="text-sm text-red-700" role="alert">
                {error}
              </p>
            ) : null}

            {showGenericFailure && !progress?.documents.length ? (
              <div
                className="rounded-[18px] border border-[#F7D3CF] bg-[#FFF9F8] px-5 py-4 text-sm text-customerHive-on-surface-variant"
                role="alert"
              >
                Extraction did not finish successfully. You can return to Documents to try again or
                add more files.
              </div>
            ) : null}

            <CustomerRawExtractionsPanel
              caseId={caseId}
              studyRunId={studyRunId}
              presentation="detailed"
              showProcessingBanner
              showOutcomeBanner={Boolean(
                progress?.extractionTerminal && progress.documents.length > 0,
              )}
            />
          </section>
        )}
      </div>
    </HiveCustomerShell>
  );
}
