"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";



import type { ProposedClaim } from "@hiveforyou/shared/canonical-study";



import { buildProvenanceIndex } from "@/lib/case/provenance-index";

import type { CaseMapViewBundle } from "@/lib/case-map/case-map-view-bundle";

import { fetchCaseMapViewBundle } from "@/lib/case-map/case-map-client";

import type { CaseSummaryPanelSpec } from "@/lib/case-summary/case-summary-evidence";

import {
  adjustCountsForAnswers,
  attestedCheckedRows,
  buildCaseSummaryModel,
} from "@/lib/case-summary/case-summary-presentation";

import { CaseMapStudyingState } from "@/components/case-map/CaseMapStudyingState";



import { CaseSummaryEvidencePanel } from "./CaseSummaryEvidencePanel";

import { caseViewToSummaryModel } from "@/lib/case-summary/case-view-to-summary-model";

import { HiveCaseCustomerExperience } from "@/components/hive-case/HiveCaseCustomerExperience";

const CaseSummaryProView = dynamic(
  () =>
    import("./CaseSummaryProView").then((mod) => ({
      default: mod.CaseSummaryProView,
    })),
  {
    loading: () => <CaseMapStudyingState rootLabel="Pro workspace" />,
  },
);



type CaseSummaryViewMode = "parent" | "pro";



const geist = "'Geist', 'Helvetica Neue', sans-serif";



type CaseSummaryExperienceProps = {

  studyRunId: string;

  initialBundle?: CaseMapViewBundle;

};



export function CaseSummaryExperience({ studyRunId, initialBundle }: CaseSummaryExperienceProps) {

  const [bundle, setBundle] = useState<CaseMapViewBundle | null>(initialBundle ?? null);

  const [loadError, setLoadError] = useState(false);

  const [answers, setAnswers] = useState<Record<string, string>>({});

  const [panelSpec, setPanelSpec] = useState<CaseSummaryPanelSpec | null>(null);
  const [viewMode, setViewMode] = useState<CaseSummaryViewMode>("parent");



  const load = useCallback(async () => {

    try {

      const loaded = await fetchCaseMapViewBundle(studyRunId);

      setBundle(loaded);

      setLoadError(false);

      return loaded;

    } catch {

      setLoadError(true);

      return null;

    }

  }, [studyRunId]);



  useEffect(() => {

    if (initialBundle) {

      return;

    }

    void load();

  }, [initialBundle, load]);



  useEffect(() => {

    if (!bundle || bundle.status !== "RUNNING") {

      return;

    }

    const timer = setInterval(() => {

      void load();

    }, 2500);

    return () => clearInterval(timer);

  }, [bundle?.status, load]);



  const provenance = useMemo(

    () => (bundle?.provenance ? buildProvenanceIndex(bundle.provenance) : null),

    [bundle?.provenance],

  );



  const claimsById = useMemo(() => {

    const map = new Map<string, ProposedClaim>();

    if (bundle?.proView) {

      for (const claim of bundle.proView.claims) {

        map.set(claim.id, claim);

      }

    }

    return map;

  }, [bundle?.proView]);



  const documentCount = bundle?.canonicalSnapshot?.sourceDocuments?.length ?? 0;

  const documentLabels = useMemo(

    () =>

      bundle?.canonicalSnapshot?.sourceDocuments?.map(

        (doc) => doc.originalFilename?.trim() || "Document",

      ) ?? [],

    [bundle?.canonicalSnapshot?.sourceDocuments],

  );



  const summaryModel = useMemo(() => {

    if (bundle?.caseView) {

      return caseViewToSummaryModel(bundle.caseView);

    }

    if (!bundle?.caseMap) {

      return null;

    }

    return buildCaseSummaryModel({

      caseMap: bundle.caseMap,

      conflicts: bundle.proView?.conflicts ?? [],

      claimsById,

      provenance,

      documentCount,

    });

  }, [
    bundle?.caseView,
    bundle?.caseMap,
    bundle?.proView?.conflicts,
    claimsById,
    provenance,
    documentCount,
  ]);



  const openDecisions = useMemo(() => {

    if (!summaryModel) {

      return [];

    }

    return summaryModel.decisions.filter((decision) => !answers[decision.id]);

  }, [summaryModel, answers]);



  const currentDecision = openDecisions[0] ?? null;

  const answeredCount = summaryModel

    ? summaryModel.decisions.filter((decision) => answers[decision.id]).length

    : 0;

  const attestedCount = attestedCheckedRows(summaryModel?.decisions ?? [], answers).length;



  const statusCounts = summaryModel

    ? adjustCountsForAnswers(summaryModel.statusCounts, answeredCount, attestedCount)

    : null;



  if (loadError && !bundle) {

    return (

      <div className="case-summary" style={shellStyle()} data-testid="case-summary-failed">

        <main style={mainStyle()}>

          <p role="alert">We couldn&apos;t load your case. Please try again.</p>

          <button type="button" className="ghost" onClick={() => void load()}>

            Retry

          </button>

        </main>

      </div>

    );

  }



  if (!bundle || bundle.status === "RUNNING") {

    return <CaseMapStudyingState rootLabel="Your case" />;

  }



  if (bundle.status === "FAILED" || !bundle.caseMap || !summaryModel || !statusCounts) {

    return (

      <div className="case-summary" style={shellStyle()} data-testid="case-summary-failed">

        <main style={mainStyle()}>

          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>We couldn&apos;t finish studying this case</h1>

          <p style={{ color: "#5F6368" }}>Your documents are still saved. Try building your hive again.</p>

          <Link href="/" style={{ fontWeight: 600 }}>

            Back to Start

          </Link>

        </main>

      </div>

    );

  }



  const decisionIndex = currentDecision
    ? summaryModel.decisions.length - openDecisions.length + 1
    : 0;

  const evidencePanel = (
    <CaseSummaryEvidencePanel
      studyRunId={studyRunId}
      spec={panelSpec}
      provenance={provenance}
      onClose={() => setPanelSpec(null)}
      onUndoAnswer={(decisionId) => {
        setAnswers((prev) => {
          const next = { ...prev };
          delete next[decisionId];
          return next;
        });
      }}
    />
  );

  return (
    <>
      {viewMode === "parent" ? (
        <div className="case-summary" style={shellStyle()}>
          <HiveCaseCustomerExperience
            caseView={bundle.caseView}
            intelligenceDomainId={bundle.canonicalSnapshot?.domainId ?? null}
            summaryModel={summaryModel}
            provenance={provenance}
            statusCounts={statusCounts}
            onOpenPanel={setPanelSpec}
            onProView={() => setViewMode("pro")}
            currentDecision={currentDecision}
            openDecisions={openDecisions}
            decisionIndex={decisionIndex}
            decisionTotal={summaryModel.decisions.length}
            onPickDecision={(label) => {
              if (currentDecision) {
                setAnswers((prev) => ({ ...prev, [currentDecision.id]: label }));
              }
            }}
            onUnsureDecision={() => {
              if (currentDecision) {
                setAnswers((prev) => ({ ...prev, [currentDecision.id]: "__unsure" }));
              }
            }}
            answers={answers}
          />
          {evidencePanel}
        </div>
      ) : null}

      {viewMode === "pro" && bundle.caseMap ? (
        <>
          <CaseSummaryProView
            caseId={bundle.caseId}
            studyRunId={studyRunId}
            bundle={bundle}
            summary={summaryModel}
            claimsById={claimsById}
            provenance={provenance}
            documentLabels={
              bundle.canonicalSnapshot?.sourceDocuments?.map(
                (doc) => doc.originalFilename?.trim() || "Document",
              ) ?? []
            }
            onOpen={setPanelSpec}
            onSwitchToParent={() => setViewMode("parent")}
          />
          <div className="case-summary">{evidencePanel}</div>
        </>
      ) : null}
    </>
  );

}



function shellStyle() {

  return {

    minHeight: "100vh",

    background: "#fff",

    color: "#0D0D0D",

    fontFamily: geist,

    fontSize: 16,

    lineHeight: 1.5,

  } as const;

}



function mainStyle() {

  return {

    maxWidth: 760,

    margin: "0 auto",

    padding: "40px 20px 64px",

    display: "flex",

    flexDirection: "column",

    gap: 36,

  } as const;

}



