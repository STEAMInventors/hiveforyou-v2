"use client";



import { useEffect, useId, useRef, useState, type ReactNode } from "react";



import type { ResolvedEvidenceRef } from "@hiveforyou/shared/projections";



import { EvidenceCropPreview } from "@/components/evidence/EvidenceCropPreview";

import { EvidenceDocumentViewer } from "@/components/evidence/EvidenceDocumentViewer";

import type { ProvenanceIndex } from "@/lib/case/provenance-index";

import {

  docDisplayName,

  highlightParts,

  primaryRefForClaim,

  type CaseSummaryPanelSpec,

} from "@/lib/case-summary/case-summary-evidence";

import { fetchEvidenceTrace } from "@/lib/evidence/evidence-trace-client";

import {

  launchViewerFromPair,

  launchViewerSingle,

  type EvidenceViewerLaunch,

} from "@/lib/evidence/evidence-viewer-state";



type CaseSummaryEvidencePanelProps = {

  studyRunId: string;

  spec: CaseSummaryPanelSpec | null;

  provenance: ProvenanceIndex | null;

  onClose: () => void;

  onUndoAnswer?: (decisionId: string) => void;

};



export function CaseSummaryEvidencePanel({

  studyRunId,

  spec,

  provenance,

  onClose,

  onUndoAnswer,

}: CaseSummaryEvidencePanelProps) {

  const titleId = useId();

  const closeRef = useRef<HTMLButtonElement>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);

  const [viewerLaunch, setViewerLaunch] = useState<EvidenceViewerLaunch | null>(null);

  const [traces, setTraces] = useState<Map<string, ResolvedEvidenceRef>>(new Map());

  const [traceLoading, setTraceLoading] = useState(false);

  const [loadError, setLoadError] = useState(false);



  useEffect(() => {

    if (!spec) {

      setDrawerOpen(false);

      setViewerLaunch(null);

      return;

    }

    setViewerLaunch(null);

    setDrawerOpen(false);

    const frame = requestAnimationFrame(() => setDrawerOpen(true));

    closeRef.current?.focus();

    return () => cancelAnimationFrame(frame);

  }, [spec]);



  useEffect(() => {

    if (!spec) {

      return;

    }

    const claimIds = claimIdsForSpec(spec);

    let cancelled = false;

    setLoadError(false);
    setTraceLoading(true);
    setTraces(new Map());

    void Promise.all(

      claimIds.map(async (claimId) => {

        const base = primaryRefForClaim(provenance, claimId);

        if (!base?.id) {

          return [claimId, base] as const;

        }

        try {

          const traced = await fetchEvidenceTrace({ studyRunId, evidenceRefId: base.id });

          return [claimId, traced] as const;

        } catch {

          return [claimId, base] as const;

        }

      }),

    )

      .then((entries) => {

        if (cancelled) {

          return;

        }

        setTraces(new Map(entries.filter(([, ref]) => ref != null) as Array<[string, ResolvedEvidenceRef]>));

      })

      .catch(() => {
        if (!cancelled) {
          setLoadError(true);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setTraceLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [spec, provenance, studyRunId]);



  useEffect(() => {

    if (!spec || viewerLaunch) {

      return;

    }

    function onKeyDown(event: KeyboardEvent) {

      if (event.key === "Escape") {

        handleCloseDrawer();

      }

    }

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);

  }, [spec, viewerLaunch]);



  function handleCloseDrawer() {

    setDrawerOpen(false);

    window.setTimeout(onClose, 280);

  }



  function openViewer(launch: EvidenceViewerLaunch) {

    setViewerLaunch(launch);

  }



  function closeViewer() {

    setViewerLaunch(null);

  }



  if (!spec) {

    return null;

  }



  const pairRefs =

    spec.t === "pair"

      ? {

          a: refForClaim(spec.claimIdA, traces, provenance),

          b: refForClaim(spec.claimIdB, traces, provenance),

        }

      : null;



  const { lab, title, body } = renderPanelContent(

    studyRunId,

    spec,

    traces,

    provenance,

    loadError,
    traceLoading,

    onUndoAnswer,

    handleCloseDrawer,

    openViewer,

    pairRefs,

  );



  return (

    <>

      <div

        className={`scrim${drawerOpen || viewerLaunch ? " on" : ""}`}

        data-testid="case-summary-evidence-scrim"

        onClick={() => {

          if (viewerLaunch) {

            closeViewer();

            return;

          }

          handleCloseDrawer();

        }}

        aria-hidden={!drawerOpen && !viewerLaunch}

      />

      <aside

          className={`drawer${drawerOpen ? " on" : ""}${viewerLaunch ? " viewer-adjacent" : ""}`}

          role="dialog"

          aria-modal="true"

          aria-labelledby={titleId}

          data-testid="case-summary-evidence-panel"

        >

          <div className="d-head">

            <div>

              <div className="lab">{lab}</div>

              <h2 id={titleId}>{title}</h2>

            </div>

            <button ref={closeRef} type="button" className="icon" aria-label="Close evidence" onClick={handleCloseDrawer}>

              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>

                <path d="M6 6l12 12M18 6 6 18" />

              </svg>

            </button>

          </div>

          <div className="d-body">{body}</div>

        </aside>

      {viewerLaunch ? (

        <EvidenceDocumentViewer

          studyRunId={studyRunId}

          provenance={provenance}

          overlayRefs={Array.from(traces.values())}

          launch={viewerLaunch}

          layout="adjacent"

          onClose={closeViewer}

        />

      ) : null}

    </>

  );

}



function claimIdsForSpec(spec: CaseSummaryPanelSpec): string[] {

  switch (spec.t) {

    case "one":

      return [spec.claimId];

    case "pair":

      return [spec.claimIdA, spec.claimIdB];

    case "gap":

      return spec.closestClaimId ? [spec.closestClaimId] : [];

    case "you":

      return spec.optionClaimIds;

    default:

      return [];

  }

}



function refForClaim(

  claimId: string,

  traces: Map<string, ResolvedEvidenceRef>,

  provenance: ProvenanceIndex | null,

): ResolvedEvidenceRef | null {

  return traces.get(claimId) ?? primaryRefForClaim(provenance, claimId);

}



function renderPanelContent(

  studyRunId: string,

  spec: CaseSummaryPanelSpec,

  traces: Map<string, ResolvedEvidenceRef>,

  provenance: ProvenanceIndex | null,

  loadError: boolean,
  traceLoading: boolean,

  onUndoAnswer: ((decisionId: string) => void) | undefined,

  onClose: () => void,

  openViewer: (launch: EvidenceViewerLaunch) => void,

  pairRefs: { a: ResolvedEvidenceRef | null; b: ResolvedEvidenceRef | null } | null,

): { lab: string; title: string; body: ReactNode } {

  if (loadError) {

    return {

      lab: "Evidence",

      title: "Source preview",

      body: <p className="note">Could not load the exact source. Showing saved references.</p>,

    };

  }



  if (spec.t === "one") {

    const ref = refForClaim(spec.claimId, traces, provenance);

    return {

      lab: "Evidence",

      title: ref ? `What ${docDisplayName(ref)} says` : "Source evidence",

      body: ref ? (

        <EvidenceBlock
          studyRunId={studyRunId}
          ref={ref}
          traceLoading={traceLoading}
          onViewInDocument={() => openViewer(launchViewerSingle(ref))}
        />

      ) : (

        <p className="note">No linked source for this choice.</p>

      ),

    };

  }



  if (spec.t === "pair") {

    const a = pairRefs?.a ?? refForClaim(spec.claimIdA, traces, provenance);

    const b = pairRefs?.b ?? refForClaim(spec.claimIdB, traces, provenance);

    return {

      lab: "Compared",

      title: spec.title,

      body: (

        <>

          {a ? (

            <EvidenceBlock
              studyRunId={studyRunId}
              ref={a}
              traceLoading={traceLoading}
              onViewInDocument={() => {

                if (a && b) {

                  openViewer(launchViewerFromPair("a", a, b));

                } else {

                  openViewer(launchViewerSingle(a));

                }

              }}

            />

          ) : null}

          <div className="vs">compared with</div>

          {b ? (

            <EvidenceBlock
              studyRunId={studyRunId}
              ref={b}
              traceLoading={traceLoading}
              onViewInDocument={() => {

                if (a && b) {

                  openViewer(launchViewerFromPair("b", a, b));

                } else {

                  openViewer(launchViewerSingle(b));

                }

              }}

            />

          ) : null}

          {a && b ? (

            <div className="row">

              <button

                type="button"

                className="btn dark"

                data-testid="case-summary-open-both-side-by-side"

                onClick={() => openViewer(launchViewerFromPair("both", a, b))}

              >

                Open both side by side

              </button>

            </div>

          ) : null}

        </>

      ),

    };

  }



  if (spec.t === "gap") {

    const closest = spec.closestClaimId

      ? refForClaim(spec.closestClaimId, traces, provenance)

      : null;

    return {

      lab: "Not found",

      title: spec.title,

      body: (

        <>

          <div className="note">

            Hive looked for {spec.lookedFor} in every document and didn&apos;t find one.

          </div>

          <div>

            <div className="lab mono" style={{ fontSize: 11, marginBottom: 4 }}>

              Searched

            </div>

            {spec.documentLabels.map((label) => (

              <div key={label} className="searchrow">

                <span>{label}</span>

                <span>no match</span>

              </div>

            ))}

          </div>

          {closest ? (

            <>

              <div className="vs">closest thing found</div>

              <EvidenceBlock
                studyRunId={studyRunId}
                ref={closest}
                traceLoading={traceLoading}
                onViewInDocument={() => openViewer(launchViewerSingle(closest))}
              />

            </>

          ) : null}

        </>

      ),

    };

  }



  const confirmDate = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return {

    lab: `You confirmed · ${confirmDate}`,

    title: spec.question,

    body: (

      <>

        <div className="note" style={{ background: "#F8FAFF", borderColor: "#C6DAFC" }}>

          The documents disagreed, so you chose. Your answer is kept separately from what the documents say, and you

          can change it.

        </div>

        {spec.optionClaimIds.map((claimId, index) => {

          const ref = refForClaim(claimId, traces, provenance);

          const picked = claimId === spec.pickedClaimId;

          return (

            <div key={claimId}>

              {index > 0 ? <div className="vs">or</div> : null}

              {ref ? (

                <EvidenceBlock
                  studyRunId={studyRunId}
                  ref={ref}
                  traceLoading={traceLoading}
                  badge={picked ? "Your choice" : undefined}
                  onViewInDocument={() => openViewer(launchViewerSingle(ref))}
                />

              ) : (

                <p className="note">Source unavailable</p>

              )}

            </div>

          );

        })}

        <div className="ev-actions">

          <button

            type="button"

            className="lnk"

            data-testid="case-summary-undo-answer"

            onClick={() => {

              onUndoAnswer?.(spec.decisionId);

              onClose();

            }}

          >

            Change my answer

          </button>

        </div>

      </>

    ),

  };

}



function EvidenceBlock({
  studyRunId,
  ref: evidenceRef,
  traceLoading,
  badge,
  onViewInDocument,
}: {
  studyRunId: string;
  ref: ResolvedEvidenceRef;
  traceLoading: boolean;
  badge?: string;
  onViewInDocument: () => void;
}) {

  const page = evidenceRef.physicalPageNumber ?? evidenceRef.page ?? null;

  const quote = evidenceRef.canonicalTextSnippet?.trim() || "No extracted text saved for this location.";

  const parts = highlightParts(quote, evidenceRef.span);

  const emptyNote =
    evidenceRef.resolution === "UNRESOLVED" && !evidenceRef.span && !evidenceRef.region
      ? "Hive could not pin an exact highlight on this page."
      : evidenceRef.resolution === "PARTIAL" && !evidenceRef.region
        ? "Hive found the quote but could not map it to an exact location on this page."
        : null;



  return (

    <div className="ev" data-testid="case-summary-evidence-block">

      <b>

        {docDisplayName(evidenceRef)}

        {page != null ? ` · page ${page}` : ""}

      </b>

      {evidenceRef.sourceFilename ? (

        <span className="file mono">{evidenceRef.sourceFilename}</span>

      ) : null}

      {badge ? <span className="picked">{badge}</span> : null}

      <blockquote className="quote">

        {parts.mark ? (

          <>

            {parts.before}

            <mark>{parts.mark}</mark>

            {parts.after}

          </>

        ) : (

          quote

        )}

      </blockquote>

      {emptyNote ? <div className="note">{emptyNote}</div> : null}

      {evidenceRef.sourceDocumentId ? (

        <>

          <EvidenceCropPreview
            studyRunId={studyRunId}
            ref={evidenceRef}
            tracePending={traceLoading}
            onOpen={onViewInDocument}
          />

          <div className="row">

            <button

              type="button"

              className="btn"

              data-testid="case-summary-view-in-document"

              onClick={onViewInDocument}

            >

              View in document

              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>

                <path d="M9 6l6 6-6 6" />

              </svg>

            </button>

          </div>

        </>

      ) : null}

    </div>

  );

}


