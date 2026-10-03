"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ResolvedEvidenceRef } from "@hiveforyou/shared/projections";

import type { ProvenanceIndex } from "@/lib/case/provenance-index";
import { docDisplayName, highlightParts } from "@/lib/case-summary/case-summary-evidence";
import {
  citationNumbersForPage,
  compareMarkerNumberStarts,
  countRegionalRefsOnPage,
  evidencePageNumber,
  pagesWithCitations,
  refsOnSourcePage,
} from "@/lib/evidence/evidence-page-facts";
import { buildSourceDocumentFileHref } from "@/lib/evidence/source-document-file-client";
import type { EvidenceViewerLaunch, EvidenceViewerPaneState } from "@/lib/evidence/evidence-viewer-state";

import { StudySourcePdfStage } from "./StudySourcePdfStage";

type EvidenceDocumentViewerProps = {
  studyRunId: string;
  provenance: ProvenanceIndex | null;
  /** Traced refs from the evidence drawer (override bundle snippets/regions). */
  overlayRefs?: ResolvedEvidenceRef[];
  launch: EvidenceViewerLaunch;
  /** Full screen vs panel to the left of the evidence drawer. */
  layout?: "fullscreen" | "adjacent";
  onClose: () => void;
};

export function EvidenceDocumentViewer({
  studyRunId,
  provenance,
  overlayRefs = [],
  launch,
  layout = "fullscreen",
  onClose,
}: EvidenceDocumentViewerProps) {
  const backRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState(launch.mode);
  const [tab, setTab] = useState(launch.tab);
  const [panes, setPanes] = useState<EvidenceViewerPaneState[]>(() => launch.panes.map((p) => ({ ...p })));
  const [zoom, setZoom] = useState(1);
  const [factsSheet, setFactsSheet] = useState(false);
  const [pageCounts, setPageCounts] = useState<Record<string, number>>({});

  const handlePageCount = useCallback((sourceDocumentId: string, numPages: number) => {
    setPageCounts((prev) =>
      prev[sourceDocumentId] === numPages ? prev : { ...prev, [sourceDocumentId]: numPages },
    );
  }, []);

  const fitZoom = useCallback(() => {
    const w = window.innerWidth;
    const drawerW = Math.min(460, w);
    const panelW = layout === "adjacent" ? Math.max(280, w - drawerW) : w;
    const factsW = panelW > 900 ? 300 : layout === "adjacent" && panelW > 720 ? 260 : 0;
    const railW = panelW > 720 ? 84 : panelW > 520 ? 72 : 0;
    const avail = panelW - factsW - railW - 48;
    const per = mode === "compare" && panelW > 700 ? avail / 2 : avail;
    return Math.max(0.45, Math.min(1.25, per / 612));
  }, [mode, layout]);

  useEffect(() => {
    setMode(launch.mode);
    setTab(launch.tab);
    setPanes(launch.panes.map((p) => ({ ...p })));
    setZoom(fitZoom());
    setOpen(false);
    const frame = requestAnimationFrame(() => setOpen(true));
    backRef.current?.focus();
    return () => cancelAnimationFrame(frame);
  }, [launch, fitZoom]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        handleClose();
        return;
      }
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        const tag = (event.target as HTMLElement | null)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") {
          return;
        }
        const delta = event.key === "ArrowRight" ? 1 : -1;
        updateActivePanePage(delta);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    function onResize() {
      setZoom((z) => (z === fitZoom() ? z : fitZoom()));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [fitZoom]);

  function handleClose() {
    setOpen(false);
    window.setTimeout(onClose, 220);
  }

  function updateActivePanePage(delta: number) {
    setPanes((prev) => {
      const index = mode === "compare" ? tab : 0;
      const next = prev.map((p, i) => ({ ...p }));
      const pane = next[index];
      if (!pane) {
        return prev;
      }
      const docId = pane.ref.sourceDocumentId ?? "";
      const max = pageCounts[docId] ?? pane.page;
      pane.page = Math.min(max, Math.max(1, pane.page + delta));
      pane.activeRefId = null;
      return next;
    });
  }

  function setPanePage(paneIndex: number, page: number) {
    setPanes((prev) => {
      const next = prev.map((p, i) => ({ ...p }));
      const pane = next[paneIndex];
      if (!pane) {
        return prev;
      }
      pane.page = page;
      pane.activeRefId = null;
      return next;
    });
  }

  function setActiveFact(refId: string) {
    setPanes((prev) => {
      const index = mode === "compare" ? tab : 0;
      const next = prev.map((p, i) => ({ ...p }));
      const pane = next[index];
      if (!pane) {
        return prev;
      }
      pane.activeRefId = refId;
      const fact = refsOnSourcePage(
        provenance,
        pane.ref.sourceDocumentId ?? "",
        pane.page,
        overlayRefs,
      ).find((r) => r.id === refId);
      if (fact) {
        const p = evidencePageNumber(fact);
        if (p != null) {
          pane.page = p;
        }
      }
      return next;
    });
    setFactsSheet(false);
  }

  const shownPanes = mode === "compare" ? panes : panes.slice(0, 1);
  const factsPane = panes[mode === "compare" ? tab : 0];
  const factsPage = factsPane?.page ?? 1;
  const factsDocId = factsPane?.ref.sourceDocumentId ?? "";
  const factsOnPage = useMemo(
    () => refsOnSourcePage(provenance, factsDocId, factsPage, overlayRefs),
    [provenance, factsDocId, factsPage, overlayRefs],
  );

  const markerNumberStarts = useMemo(() => {
    if (mode !== "compare" || panes.length < 2) {
      return panes.map(() => 1);
    }
    const counts = panes.map((pane) =>
      countRegionalRefsOnPage(
        provenance,
        pane.ref.sourceDocumentId ?? "",
        pane.page,
        overlayRefs,
      ),
    );
    return compareMarkerNumberStarts(panes.length, counts);
  }, [mode, panes, provenance, overlayRefs]);

  const factsCitationById = useMemo(() => {
    const tabIndex = mode === "compare" ? tab : 0;
    const start = markerNumberStarts[tabIndex] ?? 1;
    return citationNumbersForPage(factsOnPage, start);
  }, [mode, tab, markerNumberStarts, factsOnPage]);

  const crumb = shownPanes
    .map((p) => `${p.roleLabel} · p.${p.page}`)
    .join("  ·  ");

  return (
    <section
      className={`viewer${layout === "adjacent" ? " viewer-drawer" : ""}${open ? " on" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Document viewer"
      data-testid="evidence-document-viewer"
    >
      <div className="v-bar">
        <div className="crumb">
          <button ref={backRef} type="button" className="back" onClick={handleClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 6l-6 6 6 6" />
            </svg>
            {layout === "adjacent" ? "Back to evidence" : "Back to finding"}
          </button>
          <span className="here">{crumb}</span>
        </div>
        {panes.length > 1 ? (
          <div className="seg" role="group" aria-label="Layout">
            <button
              type="button"
              aria-pressed={mode === "single"}
              onClick={() => {
                setMode("single");
                if (tab === 1) {
                  setPanes((p) => [p[1]!, p[0]!].filter(Boolean) as EvidenceViewerPaneState[]);
                }
                setTab(0);
                setZoom(fitZoom());
              }}
            >
              One document
            </button>
            <button
              type="button"
              aria-pressed={mode === "compare"}
              onClick={() => {
                setMode("compare");
                setZoom(fitZoom());
              }}
            >
              Side by side
            </button>
          </div>
        ) : null}
        <div className="zoom" aria-label="Zoom">
          <button type="button" className="icon" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M5 12h14" />
            </svg>
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" className="icon" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <button type="button" className="icon" aria-label="Fit to width" onClick={() => setZoom(fitZoom())}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            </svg>
          </button>
        </div>
        <button type="button" className="btn factsbtn" onClick={() => setFactsSheet((v) => !v)}>
          On this page
        </button>
      </div>
      {mode === "compare" && panes.length > 1 ? (
        <div className="mtabs on">
          <div className="seg" role="group" aria-label="Document">
            {panes.map((pane, index) => (
              <button
                key={pane.ref.id}
                type="button"
                data-tab={index}
                aria-pressed={index === tab}
                onClick={() => {
                  setTab(index);
                }}
              >
                {pane.roleLabel}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="v-main">
        <div className={`panes${mode === "compare" ? " compare" : ""}`}>
          {shownPanes.map((pane, paneIndex) => (
            <DocumentPane
              key={`${pane.ref.id}-${paneIndex}`}
              studyRunId={studyRunId}
              provenance={provenance}
              overlayRefs={overlayRefs}
              pane={pane}
              paneIndex={paneIndex}
              tab={tab}
              mode={mode}
              zoom={zoom}
              pageCount={pageCounts[pane.ref.sourceDocumentId ?? ""]}
              onPageCount={handlePageCount}
              markerNumberStart={markerNumberStarts[paneIndex] ?? 1}
              onFocusPane={() => {
                if (mode === "compare") {
                  setTab(paneIndex);
                }
              }}
              onPageChange={(page) => setPanePage(paneIndex, page)}
              onSelectFact={(refId) => {
                if (mode === "compare") {
                  setTab(paneIndex);
                }
                setActiveFact(refId);
              }}
            />
          ))}
        </div>
        <aside className={`facts${factsSheet ? " sheet" : ""}`} aria-label="What Hive read on this page">
          <h3>
            What Hive read on {factsPane?.roleLabel ?? "this document"} p.{factsPage}
          </h3>
          <div className="list">
            {factsOnPage.length ? (
              factsOnPage.map((ref, index) => (
                <FactRow
                  key={ref.id}
                  ref={ref}
                  citationNumber={ref.id ? factsCitationById.get(ref.id) : undefined}
                  fallbackIndex={index}
                  roleLabel={factsPane?.roleLabel ?? docDisplayName(ref)}
                  active={factsPane?.activeRefId === ref.id}
                  onSelect={() => setActiveFact(ref.id)}
                />
              ))
            ) : (
              <p className="facts-empty">Hive took no facts from this page.</p>
            )}
          </div>
          <div className="foot">
            <span>
              Numbered marks on the page show every line Hive used. Nothing else on the page was turned into a fact.
            </span>
            {factsDocId ? (
              <a
                className="btn"
                href={buildSourceDocumentFileHref(studyRunId, factsDocId)}
                download
                data-testid="evidence-download-pdf"
              >
                Download original PDF
              </a>
            ) : null}
          </div>
        </aside>
      </div>
    </section>
  );
}

function DocumentPane({
  studyRunId,
  provenance,
  overlayRefs,
  pane,
  paneIndex,
  tab,
  mode,
  zoom,
  pageCount,
  onPageCount,
  markerNumberStart,
  onFocusPane,
  onPageChange,
}: {
  studyRunId: string;
  provenance: ProvenanceIndex | null;
  overlayRefs: ResolvedEvidenceRef[];
  pane: EvidenceViewerPaneState;
  paneIndex: number;
  tab: number;
  mode: "single" | "compare";
  zoom: number;
  pageCount: number | undefined;
  onPageCount: (sourceDocumentId: string, numPages: number) => void;
  markerNumberStart: number;
  onFocusPane: () => void;
  onPageChange: (page: number) => void;
  onSelectFact: (refId: string) => void;
}) {
  const docId = pane.ref.sourceDocumentId;
  const cited = docId ? pagesWithCitations(provenance, docId, overlayRefs) : new Set<number>();
  const factsOnPage = refsOnSourcePage(provenance, docId ?? "", pane.page, overlayRefs);
  const activeRef =
    factsOnPage.find((r) => r.id === pane.activeRefId) ??
    (pane.activeRefId === pane.ref.id ? pane.ref : null);

  const show = mode !== "compare" || paneIndex === tab;
  const totalPages = pageCount ?? Math.max(pane.page, 1);

  return (
    <section
      className={`pane${show ? " show" : ""}`}
      aria-label={pane.roleLabel}
      onPointerDown={onFocusPane}
    >
      <div className="p-top">
        <div className="doc">
          <b>{pane.roleLabel}</b>
          <span>
            {pane.ref.sourceFilename ?? docDisplayName(pane.ref)}
            {pane.ref.logicalTitle ? ` · ${pane.ref.logicalTitle}` : ""}
          </span>
        </div>
        <div className="pager">
          <button
            type="button"
            className="icon"
            aria-label="Previous page"
            disabled={pane.page <= 1}
            onClick={() => onPageChange(pane.page - 1)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          <span>
            {pane.page} / {totalPages}
          </span>
          <button
            type="button"
            className="icon"
            aria-label="Next page"
            disabled={pane.page >= totalPages}
            onClick={() => onPageChange(pane.page + 1)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </div>
      <div className="p-body">
        <nav className="rail" aria-label={`${pane.roleLabel} pages`}>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <div key={n}>
              <button
                type="button"
                className="thumb"
                aria-label={`Page ${n}${cited.has(n) ? ", has cited lines" : ""}`}
                aria-current={n === pane.page ? "page" : undefined}
                onClick={() => onPageChange(n)}
              >
                {Array.from({ length: 7 }, (_, k) => (
                  <i key={k} />
                ))}
                {cited.has(n) ? <span className="cite" /> : null}
                <span className="no">{n}</span>
              </button>
              <div className="gapr" />
            </div>
          ))}
        </nav>
        <div className="stage">
          <StudySourcePdfStage
            studyRunId={studyRunId}
            sourceDocumentId={docId}
            sourceFilename={pane.ref.sourceFilename}
            pageNumber={pane.page}
            zoom={zoom}
            activeRef={activeRef}
            factsOnPage={factsOnPage}
            scrollActiveIntoView={Boolean(activeRef?.region)}
            onPageCount={onPageCount}
            markerNumberStart={markerNumberStart}
          />
        </div>
      </div>
    </section>
  );
}

function FactRow({
  ref: evidenceRef,
  citationNumber,
  fallbackIndex,
  roleLabel,
  active,
  onSelect,
}: {
  ref: ResolvedEvidenceRef;
  citationNumber?: number;
  fallbackIndex: number;
  roleLabel: string;
  active: boolean;
  onSelect: () => void;
}) {
  const quote = evidenceRef.canonicalTextSnippet?.trim() || "Extracted line";
  const parts = highlightParts(quote, evidenceRef.span);
  const page = evidencePageNumber(evidenceRef);
  return (
    <button type="button" className="fact" aria-current={active ? "true" : undefined} onClick={onSelect}>
      <span className="n">{citationNumber ?? fallbackIndex + 1}</span>
      <span>
        <span className="a">{docDisplayName(evidenceRef)}</span>
        <br />
        <span className="v">{parts.mark || quote.slice(0, 80)}</span>
        <br />
        <span className="s">
          {roleLabel}
          {page != null ? ` · p.${page}` : ""}
        </span>
      </span>
    </button>
  );
}
