"use client";



import { useEffect, useRef, useState, type CSSProperties } from "react";



import type { ResolvedEvidenceRef } from "@hiveforyou/shared/projections";



import { isPdfRenderCancelled, loadPdfDocument } from "@/lib/evidence/pdf-document-client";
import { citationNumbersForPage } from "@/lib/evidence/evidence-page-facts";



export type EvidencePdfRenderState = "loading" | "ready" | "error";

type EvidencePdfPageCanvasProps = {
  pdfUrl: string;
  pageNumber: number;
  zoom: number;
  activeRef: ResolvedEvidenceRef | null;
  factsOnPage?: ResolvedEvidenceRef[];
  scrollActiveIntoView?: boolean;
  onRenderState?: (state: EvidencePdfRenderState) => void;
  /** When false, parent shows error UI (crop preview). */
  showInlineError?: boolean;
  /** First citation number for this pane (side-by-side compare uses 1 on the right, continued on the left). */
  markerNumberStart?: number;
};



export function EvidencePdfPageCanvas({

  pdfUrl,

  pageNumber,

  zoom,

  activeRef,

  factsOnPage = [],
  scrollActiveIntoView,
  onRenderState,
  showInlineError = true,
  markerNumberStart = 1,
}: EvidencePdfPageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const onRenderStateRef = useRef(onRenderState);
  onRenderStateRef.current = onRenderState;

  const [error, setError] = useState(false);

  const [canvasSize, setCanvasSize] = useState({ width: 612, height: 792 });



  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel?: () => void; promise: Promise<void> } | null = null;

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    setError(false);
    onRenderStateRef.current?.("loading");

    void (async () => {
      try {
        const pdf = await loadPdfDocument(pdfUrl);
        if (cancelled) {
          return;
        }

        const safePage = Math.min(Math.max(1, pageNumber), pdf.numPages);
        const page = await pdf.getPage(safePage);
        if (cancelled) {
          return;
        }

        const viewport = page.getViewport({ scale: zoom });
        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("Canvas 2d context unavailable");
        }
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
        });
        await renderTask.promise;

        if (!cancelled) {
          setCanvasSize({ width: viewport.width, height: viewport.height });
          onRenderStateRef.current?.("ready");
        }

        if (!cancelled && scrollActiveIntoView && activeRef?.region) {
          requestAnimationFrame(() => {
            wrapRef.current?.querySelector(".hl.active")?.scrollIntoView({ block: "center" });
          });
        }
      } catch (renderError) {
        if (cancelled || isPdfRenderCancelled(renderError)) {
          return;
        }
        setError(true);
        onRenderStateRef.current?.("error");
      }
    })();

    return () => {
      cancelled = true;
      try {
        renderTask?.cancel?.();
      } catch {
        /* pdf.js may throw if render already finished */
      }
    };
  }, [pdfUrl, pageNumber, zoom, scrollActiveIntoView]);



  const markerSource = factsOnPage.length ? factsOnPage : activeRef ? [activeRef] : [];
  const citationById = citationNumbersForPage(markerSource, markerNumberStart);

  return (

    <div className="page-wrap" ref={wrapRef} data-testid="evidence-pdf-page-canvas">

      <div className="page-canvas-host">

        {error && showInlineError ? (
          <p className="page-load-err">Could not render this page.</p>
        ) : null}
        <canvas
          ref={canvasRef}
          className="page-canvas"
          hidden={error && showInlineError}
          aria-hidden={error && showInlineError}
        />

        {!error
          ? markerSource.map((ref, index) => {
              if (!ref.region) {
                return null;
              }
              const citation = ref.id ? citationById.get(ref.id) : undefined;
              if (citation == null) {
                return null;
              }
              const isActive = activeRef?.id === ref.id;
              return (
                <div
                  key={ref.id || `${index}-${ref.claimId}`}
                  className={`hl${isActive ? " active" : ""}`}
                  style={regionStyle(ref.region, canvasSize.width, canvasSize.height)}
                  data-testid={isActive ? "evidence-page-highlight" : undefined}
                >
                  <span className="hl-n">{citation}</span>
                </div>
              );
            })
          : null}

      </div>

    </div>

  );

}



function regionStyle(

  region: NonNullable<ResolvedEvidenceRef["region"]>,

  canvasW?: number,

  canvasH?: number,

): CSSProperties {

  const normalized =

    region.x <= 1 &&

    region.y <= 1 &&

    region.width <= 1 &&

    region.height <= 1 &&

    region.x >= 0;

  if (normalized) {

    return {

      left: `${region.x * 100}%`,

      top: `${region.y * 100}%`,

      width: `${region.width * 100}%`,

      height: `${region.height * 100}%`,

    };

  }

  const w = canvasW && canvasW > 0 ? canvasW : 612;

  const h = canvasH && canvasH > 0 ? canvasH : 792;

  return {

    left: `${(region.x / w) * 100}%`,

    top: `${(region.y / h) * 100}%`,

    width: `${(region.width / w) * 100}%`,

    height: `${(region.height / h) * 100}%`,

  };

}


