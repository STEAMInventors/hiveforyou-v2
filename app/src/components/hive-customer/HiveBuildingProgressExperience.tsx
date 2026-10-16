"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { fetchHiveExtractionProgress } from "@/lib/hive-customer/hive-extraction-progress-client";
import type { HiveExtractionProgressView } from "@/lib/hive-customer/hive-extraction-progress-types";
import { buildHiveReadyHref } from "@/lib/intake/study-completion-navigation";

import { HiveCustomerDocumentRowsBuilding } from "./HiveCustomerDocumentRows";
import { HiveCustomerShell } from "./HiveCustomerShell";
import { hiveBuildingHeadline } from "./hive-customer-copy";

const POLL_MS = 2500;

export function HiveBuildingProgressExperience({
  caseId,
  studyRunId,
}: {
  caseId: string;
  studyRunId: string;
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
    const timer = window.setInterval(() => {
      void refresh();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const terminalFailure =
    progress?.extractionTerminal && !progress.extractionCompleteForExplore;

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
      <div className="mx-auto flex w-full max-w-[680px] flex-1 flex-col items-center px-6 py-[72px] sm:px-0 lg:px-10">
        <header className="mb-10 w-full">
          <h1
            className="text-[30px] font-semibold leading-[38px] tracking-[-0.015em] text-customerHive-on-surface"
            style={{ fontFamily: "var(--font-outfit), sans-serif" }}
          >
            {hiveBuildingHeadline(progress?.subjectFirstName ?? null)}
          </h1>
          <p className="mt-2 text-base font-normal leading-6 text-customerHive-on-surface-variant">
            Reading your documents.
          </p>
        </header>

        {error ? (
          <p className="mb-6 w-full text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}

        {terminalFailure ? (
          <div
            className="mb-8 w-full rounded-xl border border-customerHive-border bg-customerHive-surface-low p-4 text-sm text-customerHive-on-surface-variant"
            role="alert"
          >
            Extraction did not finish successfully. You can return to Documents to try again or add
            more files.
          </div>
        ) : null}

        <section aria-label="Document ingestion status" className="w-full">
          <h2 className="mb-4 text-[21px] font-medium leading-7 tracking-[-0.01em] text-customerHive-on-surface">
            Your documents
          </h2>
          {progress?.documents.length ? (
            <HiveCustomerDocumentRowsBuilding documents={progress.documents} />
          ) : (
            <p className="text-sm text-customerHive-on-surface-muted">Waiting for document list…</p>
          )}
        </section>
      </div>
    </HiveCustomerShell>
  );
}
