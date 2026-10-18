"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import type { CanonicalStudyReportProjection } from "@hiveforyou/shared/canonical-study-report-projection";
import type { HiveUiTree } from "@hiveforyou/shared/hive-ui-tree";

import { HiveUiRenderer } from "@/components/hive-ui/HiveUiRenderer";
import {
  buildCanonicalStudyHighlights,
  buildCanonicalStudyOverviewParagraph,
  buildCanonicalStudyReadyHeadline,
  type CanonicalStudyExperienceState,
  studyRunStatusCustomerLabel,
} from "@/lib/hive-customer/canonical-study-experience-model";
import type { HiveExtractionProgressView } from "@/lib/hive-customer/hive-extraction-progress-types";
import { brand } from "@/lib/brand/paths";

import { CanonicalStudyCustomerReportView } from "./CanonicalStudyCustomerReportView";
import { CanonicalStudyReportEvidenceChip } from "./CanonicalStudyReportEvidenceChip";

type ReportPayload = CanonicalStudyReportProjection & { hiveUiTree?: HiveUiTree | null };

const outfit = { fontFamily: "var(--font-outfit), sans-serif" } as const;

const TONE_DOT: Record<string, string> = {
  blue: "bg-[#3B7CF6]",
  coral: "bg-[#EF5143]",
  amber: "bg-[#F6B826]",
  green: "bg-[#2FA35A]",
};

const TONE_KICKER: Record<string, string> = {
  blue: "text-[#2456B8]",
  coral: "text-[#B4352A]",
  amber: "text-[#8A5A00]",
  green: "text-[#1E7A41]",
};

function IntroBullet({ tone, children }: { tone: keyof typeof TONE_DOT; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3.5 rounded-[14px] bg-[#F7F8FA] p-4">
      <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${TONE_DOT[tone]}`} aria-hidden />
      <span className="text-[15px] leading-snug text-customerHive-on-surface">{children}</span>
    </div>
  );
}

function CardShell({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <div
      data-testid={testId}
      className="rounded-[22px] border border-customerHive-border bg-white p-8 sm:p-10 lg:p-12"
    >
      {children}
    </div>
  );
}

export function CanonicalStudyExperiencePanel({
  state,
  progress,
  projection,
  openAiOnly,
  subjectFirstName,
  studyMapHref,
  documentsHref,
  reportsHref,
  myCasesHref,
  loadError,
  onBuildClick,
  buildDisabled,
  showPreviousStudyNote,
  debugJsonSection,
}: {
  state: CanonicalStudyExperienceState;
  progress: HiveExtractionProgressView | null;
  projection: ReportPayload | null;
  openAiOnly: boolean;
  subjectFirstName: string | null | undefined;
  studyMapHref: string;
  documentsHref: string;
  reportsHref: string;
  myCasesHref: string;
  loadError: string | null;
  onBuildClick: () => void;
  buildDisabled: boolean;
  showPreviousStudyNote: boolean;
  debugJsonSection: ReactNode;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [openHighlightId, setOpenHighlightId] = useState<string | null>(null);

  const docCount = progress?.readDocumentCount ?? progress?.documents.length ?? 0;
  const studyStatus = progress?.studyRunStatus;
  const customerBody = projection?.audience === "customer" ? projection.body : null;
  const highlights = customerBody ? buildCanonicalStudyHighlights(customerBody) : [];
  const overview = customerBody ? buildCanonicalStudyOverviewParagraph(customerBody) : "";

  if (state === "loading") {
    return (
      <CardShell testId="canonical-study-loading">
        <p className="text-sm text-customerHive-on-surface-muted">Loading your study…</p>
      </CardShell>
    );
  }

  if (state === "not_ready") {
    return (
      <CardShell testId="canonical-study-not-ready">
        <div className="flex max-w-[760px] flex-col items-start gap-4">
          <h2 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-customerHive-on-surface" style={outfit}>
            Your study starts with your documents
          </h2>
          <p className="text-[16.5px] leading-relaxed text-customerHive-on-surface-variant">
            Documents must finish processing before a study can be created. When at least one document
            has been read, you can build a study that connects the information across them.
          </p>
          <Link
            href={documentsHref}
            className="inline-flex h-[46px] items-center rounded-[11px] bg-customerHive-secondary px-5 text-[15px] font-semibold text-white hover:bg-[#2456B8]"
          >
            Go to Documents
          </Link>
        </div>
      </CardShell>
    );
  }

  if (state === "ready_to_build") {
    return (
      <>
        <CardShell testId="canonical-study-ready-to-build">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
            <div className="flex flex-col items-start gap-[18px]">
              <h2
                className="text-[30px] font-semibold leading-[1.15] tracking-[-0.02em] text-customerHive-on-surface sm:text-[34px]"
                style={outfit}
              >
                Ready to understand the bigger picture?
              </h2>
              <p className="text-[17px] leading-relaxed text-customerHive-on-surface-variant">
                HiveForYou will connect the information across your {docCount} document
                {docCount === 1 ? "" : "s"}: what each one says, how things changed over time, and
                where documents differ.
              </p>
              <button
                type="button"
                data-testid="canonical-study-build-cta"
                disabled={buildDisabled}
                onClick={onBuildClick}
                className="inline-flex h-[50px] items-center rounded-xl bg-customerHive-secondary px-6 text-base font-semibold text-white hover:bg-[#2456B8] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Build my study
              </button>
            </div>
            <div className="flex flex-col gap-3">
              <IntroBullet tone="blue">
                Findings are connected across documents, not read one at a time.
              </IntroBullet>
              <IntroBullet tone="coral">
                Every finding links to the page it came from.
              </IntroBullet>
              <IntroBullet tone="amber">
                Your study becomes the basis for any report you create.
              </IntroBullet>
            </div>
          </div>
        </CardShell>
        {loadError ? (
          <p className="mt-4 text-sm text-red-700" role="alert">
            {loadError}
          </p>
        ) : null}
        {debugJsonSection}
      </>
    );
  }

  if (state === "processing") {
    return (
      <CardShell testId="canonical-study-processing">
        <div className="flex max-w-[760px] flex-col items-start gap-7">
          <Image src={brand.motion} alt="" width={56} height={56} className="h-14 w-14" />
          <div className="flex flex-col gap-2.5">
            <h2 className="text-[30px] font-semibold leading-tight tracking-[-0.02em] text-customerHive-on-surface" style={outfit}>
              Connecting the information in your documents
            </h2>
            <p className="text-[16.5px] leading-relaxed text-customerHive-on-surface-variant">
              This usually takes a few minutes. You can leave and come back; your study will be here
              when it&apos;s ready.
            </p>
          </div>
          <div
            className="rounded-[14px] border border-customerHive-border bg-[#F7F8FA] px-4 py-3"
            role="status"
            aria-live="polite"
          >
            <p className="text-sm font-medium text-customerHive-on-surface">
              Study run status:{" "}
              {studyStatus ? studyRunStatusCustomerLabel(studyStatus) : "Checking…"}
            </p>
            {studyStatus ? (
              <p className="mt-1 font-mono text-xs text-customerHive-on-surface-muted">{studyStatus}</p>
            ) : null}
          </div>
          {showPreviousStudyNote ? (
            <p className="text-[14.5px] text-customerHive-on-surface-muted">
              Your previous study and its reports stay available in the meantime.
            </p>
          ) : null}
          <Link href={myCasesHref} className="text-[15px] font-semibold text-customerHive-secondary hover:underline">
            Return to My Hives
          </Link>
        </div>
      </CardShell>
    );
  }

  if (state === "failure") {
    return (
      <>
        <CardShell testId="canonical-study-failure">
          <div className="flex max-w-[760px] flex-col items-start gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-[#FDEDEB] text-[#B4352A]">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </span>
            <h2 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-customerHive-on-surface" style={outfit}>
              We couldn&apos;t finish your study
            </h2>
            <p className="text-[16.5px] leading-relaxed text-customerHive-on-surface-variant">
              {loadError ??
                "Something interrupted us while building your study. Your documents are safe and nothing was lost. Trying again usually works."}
            </p>
            <div className="flex flex-wrap gap-2.5 pt-1">
              <button
                type="button"
                data-testid="canonical-study-retry"
                disabled={buildDisabled}
                onClick={onBuildClick}
                className="inline-flex h-[46px] items-center gap-2 rounded-[11px] bg-customerHive-secondary px-5 text-[15px] font-semibold text-white hover:bg-[#2456B8] disabled:opacity-60"
              >
                Try again
              </button>
              <Link
                href={documentsHref}
                className="inline-flex h-[46px] items-center rounded-[11px] border border-customerHive-border bg-white px-[18px] text-[15px] font-semibold text-customerHive-on-surface hover:bg-[#F4F6F8]"
              >
                Back to Documents
              </Link>
            </div>
          </div>
        </CardShell>
        {debugJsonSection}
      </>
    );
  }

  // study_ready
  return (
    <div className="flex min-w-0 flex-col gap-8" data-testid="canonical-study-ready">
      {openAiOnly ? (
        <CardShell>
          <div className="flex max-w-[760px] flex-col gap-4">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#EAF6EE] px-3 py-1 text-xs font-semibold text-[#1E7A41]">
              Study ready
            </span>
            <p className="text-[16.5px] leading-relaxed text-customerHive-on-surface-variant">
              Your canonical study finished successfully. Open the study map for validated findings
              and provenance.
            </p>
            <div className="flex flex-wrap gap-2.5">
              <Link
                href={studyMapHref}
                className="inline-flex h-12 items-center rounded-xl bg-customerHive-secondary px-[22px] text-[15.5px] font-semibold text-white hover:bg-[#2456B8]"
              >
                Open study map
              </Link>
              <Link
                href={reportsHref}
                className="inline-flex h-12 items-center rounded-xl border border-customerHive-border bg-white px-5 text-[15.5px] font-semibold text-customerHive-on-surface hover:bg-[#F4F6F8]"
              >
                Create a report
              </Link>
            </div>
          </div>
        </CardShell>
      ) : (
        <>
          <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-3.5">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#EAF6EE] px-3 py-1 text-xs font-semibold text-[#1E7A41]">
                <svg aria-hidden className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Study ready · built from {docCount} document{docCount === 1 ? "" : "s"}
              </span>
              <h2
                className="text-[30px] font-semibold leading-tight tracking-[-0.02em] text-customerHive-on-surface"
                style={outfit}
              >
                {buildCanonicalStudyReadyHeadline(subjectFirstName)}
              </h2>
              {overview ? (
                <p className="text-[17px] leading-relaxed text-customerHive-on-surface">{overview}</p>
              ) : (
                <p className="text-[15px] text-customerHive-on-surface-variant">
                  Validated findings from your documents are ready below.
                </p>
              )}
              <div className="flex flex-wrap gap-2.5 pt-2">
                <Link
                  href={reportsHref}
                  data-testid="canonical-study-create-report"
                  className="inline-flex h-12 items-center rounded-xl bg-customerHive-secondary px-[22px] text-[15.5px] font-semibold text-white hover:bg-[#2456B8]"
                >
                  Create a report
                </Link>
                <button
                  type="button"
                  onClick={() => setDetailsOpen((value) => !value)}
                  className="inline-flex h-12 items-center rounded-xl border border-customerHive-border bg-white px-5 text-[15.5px] font-semibold text-customerHive-on-surface hover:bg-[#F4F6F8]"
                >
                  {detailsOpen ? "Hide details" : "Show details"}
                </button>
                <Link
                  href={studyMapHref}
                  className="inline-flex h-12 items-center rounded-xl border border-customerHive-border bg-white px-5 text-[15.5px] font-semibold text-customerHive-on-surface hover:bg-[#F4F6F8]"
                >
                  Study map
                </Link>
              </div>
            </div>

            {highlights.length > 0 ? (
              <div className="flex min-w-0 flex-col gap-3">
                <span className="text-[13px] font-semibold text-customerHive-on-surface-muted">
                  Highlights
                </span>
                {highlights.map((highlight) => {
                  const open = openHighlightId === highlight.id;
                  return (
                    <div
                      key={highlight.id}
                      className="overflow-hidden rounded-2xl border border-customerHive-border bg-white"
                    >
                      <button
                        type="button"
                        className="flex w-full items-start gap-3.5 px-5 py-[18px] text-left hover:bg-[#FAFBFC]"
                        aria-expanded={open}
                        onClick={() =>
                          setOpenHighlightId((current) => (current === highlight.id ? null : highlight.id))
                        }
                      >
                        <span
                          className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${TONE_DOT[highlight.tone]}`}
                          aria-hidden
                        />
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className={`text-xs font-semibold ${TONE_KICKER[highlight.tone]}`}>
                            {highlight.kicker}
                          </span>
                          <span className="text-[16.5px] font-semibold leading-snug text-customerHive-on-surface">
                            {highlight.title}
                          </span>
                        </span>
                        <svg
                          aria-hidden
                          className={`mt-1 h-[18px] w-[18px] shrink-0 text-customerHive-on-surface-muted transition-transform ${open ? "rotate-180" : ""}`}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          viewBox="0 0 24 24"
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                      {open ? (
                        <div className="flex flex-col gap-3 px-5 pb-[18px] pl-11">
                          {highlight.body !== highlight.title ? (
                            <p className="text-[15px] leading-relaxed text-customerHive-on-surface-variant">
                              {highlight.body}
                            </p>
                          ) : null}
                          <div className="flex flex-wrap gap-2">
                            {highlight.facts.flatMap((fact) =>
                              fact.evidence.map((chip, index) => (
                                <CanonicalStudyReportEvidenceChip
                                  key={`${chip.claimRef.fieldKey}-${index}`}
                                  chip={chip}
                                />
                              )),
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          {detailsOpen && projection ? (
            <div className="border-t border-customerHive-border pt-8">
              {projection.hiveUiTree ? (
                <HiveUiRenderer
                  projection={projection}
                  tree={projection.hiveUiTree}
                  studyRunId={projection.studyRunId}
                />
              ) : projection.audience === "customer" ? (
                <CanonicalStudyCustomerReportView body={projection.body} />
              ) : null}
              <section className="mt-10 max-w-[760px]">
                <h3 className="text-xl font-semibold text-customerHive-on-surface" style={outfit}>
                  What this study can&apos;t tell you
                </h3>
                <p className="mt-2 text-[15.5px] leading-relaxed text-customerHive-on-surface-variant">
                  This study only reflects the documents in this Hive. It describes what they say and
                  where they differ. It doesn&apos;t decide whether a plan is appropriate; that&apos;s a
                  conversation for you, the school team and any professional you work with.
                </p>
              </section>
            </div>
          ) : null}
        </>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-customerHive-border pt-6">
        <button
          type="button"
          data-testid="generate-canonical-study"
          disabled={buildDisabled}
          onClick={onBuildClick}
          className="rounded-[10px] border border-customerHive-border bg-white px-4 py-2 text-sm font-semibold text-customerHive-on-surface hover:bg-[#F4F6F8] disabled:opacity-60"
        >
          {projection || openAiOnly ? "Update my study" : "Build my study"}
        </button>
      </div>

      {loadError && state === "study_ready" ? (
        <p className="text-sm text-red-700" role="alert">
          {loadError}
        </p>
      ) : null}

      {debugJsonSection}
    </div>
  );
}
