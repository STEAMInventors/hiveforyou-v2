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
} from "@/lib/intake/study-completion-navigation";

import { CaseDocumentsSubNav } from "./CaseDocumentsSubNav";
import { CustomerRawExtractionsPanel } from "./HiveCustomerDocumentRows";
import { HiveCustomerShell } from "./HiveCustomerShell";
import { hivePossessiveTitle } from "./hive-customer-copy";
import {
  buildHiveDocumentsSectionHref,
  buildIntakeDocumentsSectionHref,
  type CaseDocumentsView,
} from "@/lib/intake/study-completion-navigation";

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
      <div className="mx-auto w-full max-w-[1440px] px-6 py-10 lg:px-10">
        <CaseDocumentsSubNav
          activeView={documentsView}
          filesHref={filesHref}
          rawExtractionsHref={rawExtractionsHref}
        />
        <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-12">
          <div className="flex flex-col lg:col-span-7">
            <div className="mb-10 flex flex-col">
              <div className="mb-2 flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-customerHive-primary-fixed px-2.5 py-1 text-xs font-medium text-customerHive-primary">
                  <span
                    className="material-symbols-outlined text-[15px]"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    check_circle
                  </span>
                  Extraction complete
                </span>
              </div>
              <h1
                className="text-[30px] font-semibold leading-[38px] tracking-tight text-customerHive-on-surface"
                style={{ fontFamily: "var(--font-outfit), sans-serif" }}
              >
                {hivePossessiveTitle(progress?.subjectFirstName ?? null, "hive is ready")}
              </h1>
              <p className="mt-1.5 text-lg text-customerHive-on-surface-variant">
                {docCount} document{docCount === 1 ? "" : "s"} read
                {detailCount > 0 ? (
                  <>
                    <span className="mx-1">·</span>
                    {detailCount} extracted detail{detailCount === 1 ? "" : "s"}
                  </>
                ) : null}
              </p>
            </div>

            {documentsView === "files" ? (
              <div className="rounded-xl border border-customerHive-border bg-customerHive-surface-low p-6">
                <h2 className="text-[21px] font-semibold leading-7 text-customerHive-on-surface">
                  Your files
                </h2>
                <p className="mt-2 text-sm text-customerHive-on-surface-variant">
                  Upload, remove, or add documents from your intake workspace.
                </p>
                {documentsHref ? (
                  <Link
                    href={documentsHref}
                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-customerHive-primary hover:underline"
                  >
                    <span className="material-symbols-outlined text-[16px]">upload_file</span>
                    Manage uploaded files
                  </Link>
                ) : (
                  <p className="mt-4 text-sm text-customerHive-on-surface-muted">
                    File management will appear when an intake run is linked to this case.
                  </p>
                )}
              </div>
            ) : (
              <>
                <h2 className="mb-4 text-[21px] font-semibold leading-7 text-customerHive-on-surface">
                  Raw extractions
                </h2>
                <CustomerRawExtractionsPanel
                  caseId={caseId}
                  studyRunId={studyRunId}
                  presentation="detailed"
                  pollWhileProcessing={false}
                />
              </>
            )}

            {progress && progress.thingsThatWouldHelp.length > 0 ? (
              <section className="mt-10">
                <h2 className="mb-3 text-lg font-semibold text-customerHive-on-surface">
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

          <div className="flex flex-col space-y-6 lg:col-span-5 lg:sticky lg:top-24">
            <div
              className="flex flex-col rounded-[20px] bg-customerHive-surface-low p-6 shadow-sm"
              data-testid="hive-explore-card"
            >
              <h3 className="mb-2 font-serif text-xl leading-[26px] text-customerHive-on-surface">
                Explore your hive
              </h3>
              <p className="mb-6 text-[15px] leading-relaxed text-customerHive-on-surface-variant">
                Generate the canonical study from your extracted documents, then create Customer
                or Pro reports with validated source chips.
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
                className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-customerHive-secondary px-6 py-3.5 text-center text-base font-medium text-white shadow-sm transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span>
                  {exploreState === "running"
                    ? "Generating study…"
                    : `Generate study${
                        progress?.subjectFirstName ? ` for ${progress.subjectFirstName}` : ""
                      }`}
                </span>
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </button>
              {documentsHref ? (
                <Link
                  href={documentsHref}
                  className="flex items-center justify-center gap-1.5 py-1 text-sm text-customerHive-on-surface-variant transition-colors hover:text-customerHive-on-surface"
                >
                  <span className="material-symbols-outlined text-[16px]">upload_file</span>
                  Add another document
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </HiveCustomerShell>
  );
}
