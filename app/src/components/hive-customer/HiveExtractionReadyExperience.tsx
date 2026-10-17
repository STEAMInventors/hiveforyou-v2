"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { fetchHiveExtractionProgress } from "@/lib/hive-customer/hive-extraction-progress-client";
import type { HiveExtractionProgressView } from "@/lib/hive-customer/hive-extraction-progress-types";
import { runDeterministicCanonicalStudyFromClient } from "@/lib/hive-customer/run-deterministic-canonical-study-client";
import {
  buildHiveBuildingHref,
  buildHiveCanonicalJsonHref,
  buildHiveDocumentsSectionHref,
  buildIntakeDocumentsSectionHref,
  type CaseDocumentsView,
} from "@/lib/intake/study-completion-navigation";

import { CaseDocumentsSubNav } from "./CaseDocumentsSubNav";
import { CustomerRawExtractionsPanel, CustomerYourFilesPanel } from "./HiveCustomerDocumentRows";
import { HiveCustomerShell } from "./HiveCustomerShell";

export function HiveExtractionReadyExperience({
  caseId,
  studyRunId,
  documentsView = "raw-extractions",
  workspaceAudience,
}: {
  caseId: string;
  studyRunId: string;
  documentsView?: CaseDocumentsView;
  workspaceAudience?: "customer" | "pro";
}) {
  const router = useRouter();
  const [progress, setProgress] = useState<HiveExtractionProgressView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exploreState, setExploreState] = useState<"idle" | "running">("idle");

  const load = useCallback(async () => {
    try {
      const next = await fetchHiveExtractionProgress(caseId, studyRunId);
      setProgress(next);
      setError(null);
      if (!next.extractionCompleteForExplore) {
        router.replace(buildHiveBuildingHref({ caseId, studyRunId }));
      }
    } catch {
      setError("We couldn't load your hive. Try refreshing this page.");
    }
  }, [caseId, router, studyRunId]);

  useEffect(() => {
    void load();
  }, [load]);

  const exploreHive = useCallback(async () => {
    setExploreState("running");
    setError(null);
    try {
      await runDeterministicCanonicalStudyFromClient({ caseId, studyRunId });
      router.push(buildHiveCanonicalJsonHref({ caseId, studyRunId }));
    } catch (err) {
      setExploreState("idle");
      setError(
        err instanceof Error ? err.message : "Could not build the canonical study. Try again.",
      );
    }
  }, [caseId, router, studyRunId]);

  const exploreHref = buildHiveCanonicalJsonHref({ caseId, studyRunId });
  const intakeRunId = progress?.intakeRunId ?? null;
  const documentsHref = intakeRunId
    ? buildIntakeDocumentsSectionHref({
        intakeRunId,
        studyRunId,
        audience: workspaceAudience,
        view: "files",
      })
    : null;
  const filesHref = buildHiveDocumentsSectionHref({
    caseId,
    studyRunId,
    intakeRunId,
    audience: workspaceAudience,
    segment: "ready",
    view: "files",
  });
  const rawExtractionsHref = buildHiveDocumentsSectionHref({
    caseId,
    studyRunId,
    intakeRunId,
    audience: workspaceAudience,
    segment: "ready",
    view: "raw-extractions",
  });

  const docCount = progress?.readDocumentCount ?? progress?.documents.length ?? 0;
  const detailCount = progress?.totalDetailCount ?? 0;

  return (
    <HiveCustomerShell
      intakeRunId={progress?.intakeRunId}
      exploreHiveHref={exploreHref}
      exploreDisabled={!progress?.extractionCompleteForExplore}
      workspace={{
        caseId,
        studyRunId,
        intakeRunId: progress?.intakeRunId,
        caseLabel: progress?.subjectFirstName,
        activeSection: "documents",
        audience: workspaceAudience,
      }}
    >
      <div className="mx-auto w-full min-w-0 max-w-[1160px] px-5 py-8 sm:px-8 sm:py-9 lg:px-8">
        <CaseDocumentsSubNav
          activeView={documentsView}
          filesHref={filesHref}
          rawExtractionsHref={rawExtractionsHref}
        />

        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12 lg:gap-10">
          <div className="flex min-w-0 flex-col lg:col-span-7">
            {documentsView === "files" ? (
              <section className="flex flex-col gap-6 pt-2">
                <header className="flex flex-col gap-1">
                  <h1
                    className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-customerHive-on-surface sm:text-[28px]"
                    style={{ fontFamily: "var(--font-outfit), sans-serif" }}
                  >
                    Your files
                  </h1>
                  <p className="text-base text-customerHive-on-surface-variant">
                    Upload, remove, or add documents from your intake workspace.
                  </p>
                </header>
                <CustomerYourFilesPanel
                  caseId={caseId}
                  studyRunId={studyRunId}
                  manageFilesHref={documentsHref}
                  pollWhileProcessing={false}
                />
              </section>
            ) : (
              <section className="flex min-w-0 flex-col gap-6 pt-2">
                <header className="flex flex-col gap-2">
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#EAF6EE] px-3 py-1 text-xs font-semibold text-[#1E7A41]">
                    <svg
                      aria-hidden
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="3"
                      viewBox="0 0 24 24"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Extraction complete
                  </span>
                  <h1
                    className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-customerHive-on-surface sm:text-[30px]"
                    style={{ fontFamily: "var(--font-outfit), sans-serif" }}
                  >
                    Raw extractions
                  </h1>
                  <p className="text-[15px] text-customerHive-on-surface-variant">
                    {docCount} document{docCount === 1 ? "" : "s"} read
                    {detailCount > 0 ? (
                      <>
                        <span className="mx-1">·</span>
                        {detailCount} extracted detail{detailCount === 1 ? "" : "s"}
                      </>
                    ) : null}
                  </p>
                </header>

                <CustomerRawExtractionsPanel
                  caseId={caseId}
                  studyRunId={studyRunId}
                  presentation="detailed"
                  pollWhileProcessing={false}
                  showOutcomeBanner
                />
              </section>
            )}

            {progress && progress.thingsThatWouldHelp.length > 0 ? (
              <section className="mt-8 rounded-[18px] border border-customerHive-border bg-white p-5">
                <h2 className="mb-2 text-base font-semibold text-customerHive-on-surface">
                  Documents that would help
                </h2>
                <ul className="list-disc space-y-1 pl-5 text-sm text-customerHive-on-surface-variant">
                  {progress.thingsThatWouldHelp.map((item) => (
                    <li key={item.packExpectationId}>{item.customerLabel}</li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          <aside className="flex min-w-0 flex-col lg:col-span-5 lg:sticky lg:top-24">
            <div
              className="flex flex-col rounded-[20px] border border-customerHive-border bg-white p-6 shadow-sm"
              data-testid="hive-explore-card"
            >
              <h3
                className="mb-2 text-xl font-semibold leading-snug text-customerHive-on-surface"
                style={{ fontFamily: "var(--font-outfit), sans-serif" }}
              >
                Explore your hive
              </h3>
              <p className="mb-6 text-[15px] leading-relaxed text-customerHive-on-surface-variant">
                Generate the canonical study from your extracted documents, then create Customer or
                Pro reports with validated source chips.
              </p>
              {error ? (
                <p className="mb-4 text-sm text-red-700" role="alert">
                  {error}
                </p>
              ) : null}
              <button
                type="button"
                data-testid="hive-explore-cta"
                disabled={exploreState === "running" || !progress?.extractionCompleteForExplore}
                onClick={() => void exploreHive()}
                className="mb-3 flex w-full items-center justify-center gap-2 rounded-[10px] bg-customerHive-secondary px-6 py-3.5 text-center text-base font-semibold text-white transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span>
                  {exploreState === "running"
                    ? "Generating study…"
                    : "Generate study"}
                </span>
                <svg
                  aria-hidden
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.2"
                  viewBox="0 0 24 24"
                >
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
              {documentsHref ? (
                <Link
                  href={documentsHref}
                  className="flex items-center justify-center gap-1.5 py-1 text-sm text-customerHive-on-surface-variant transition-colors hover:text-customerHive-on-surface"
                >
                  Add another document
                </Link>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </HiveCustomerShell>
  );
}
