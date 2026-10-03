"use client";



import { useEffect, useState } from "react";



import type { ResolvedEvidenceRef } from "@hiveforyou/shared/projections";



import { docDisplayName, pageCropScrollTop } from "@/lib/case-summary/case-summary-evidence";

import { evidencePageNumber } from "@/lib/evidence/evidence-page-facts";

import { buildSourceDocumentFileHref } from "@/lib/evidence/source-document-file-client";

import { useStudyPdfBlobUrl } from "@/lib/evidence/use-study-pdf-blob-url";



import { EvidencePdfPageCanvas, type EvidencePdfRenderState } from "./EvidencePdfPageCanvas";



/** Render scale; `EvidencePdfPageCanvas` applies the same factor as CSS zoom (~scale² visually). */

const CROP_RENDER_ZOOM = 0.68;

const CROP_VISUAL_SCALE = CROP_RENDER_ZOOM;

const CROP_VIEWPORT_HEIGHT_PX = 240;



type EvidenceCropPreviewProps = {

  studyRunId: string;

  ref: ResolvedEvidenceRef;

  tracePending?: boolean;

  onOpen: () => void;

};



export function EvidenceCropPreview({

  studyRunId,

  ref: evidenceRef,

  tracePending = false,

  onOpen,

}: EvidenceCropPreviewProps) {

  const page = evidencePageNumber(evidenceRef) ?? 1;

  const docId = evidenceRef.sourceDocumentId;

  const pdfApiUrl = docId

    ? buildSourceDocumentFileHref(studyRunId, docId, null, {

        originalFilename: evidenceRef.sourceFilename,

      })

    : null;

  const label = `${docDisplayName(evidenceRef)} page ${page}`;

  const hasRegion = Boolean(evidenceRef.region);

  const partialNoBox =

    !hasRegion &&

    (evidenceRef.resolution === "PARTIAL" ||

      evidenceRef.resolution === "UNRESOLVED" ||

      Boolean(evidenceRef.resolutionIssues?.length));

  const snippet = evidenceRef.canonicalTextSnippet?.trim() ?? "";

  const cropScroll = pageCropScrollTop(evidenceRef, CROP_VIEWPORT_HEIGHT_PX, CROP_VISUAL_SCALE);



  const previewEnabled = !tracePending && Boolean(pdfApiUrl);

  const { state: fetchState, blobUrl } = useStudyPdfBlobUrl(pdfApiUrl, previewEnabled);

  const [renderState, setRenderState] = useState<EvidencePdfRenderState>("loading");



  useEffect(() => {

    setRenderState("loading");

  }, [pdfApiUrl, blobUrl]);



  const embedSrc = blobUrl ? `${blobUrl}#page=${page}&zoom=page-width` : null;

  const useIframeFallback = fetchState === "ready" && Boolean(embedSrc) && renderState === "error";

  const previewReady = fetchState === "ready" && (renderState === "ready" || useIframeFallback);

  const previewFailed =

    fetchState === "error" || (fetchState === "ready" && renderState === "error" && !useIframeFallback);



  return (

    <div className="crop-wrap" data-testid="case-summary-evidence-crop-wrap">

      <button

        type="button"

        className="crop"

        aria-label={`View ${label} in the document`}

        onClick={onOpen}

        data-testid="case-summary-evidence-crop"

      >

        <div className="crop-inner">

          {tracePending ? (

            <div className="crop-status" role="status">

              Pinning this quote on the page…

            </div>

          ) : !pdfApiUrl ? (

            <div className="crop-status crop-error">

              <span>No file linked for this source.</span>

              {snippet ? <span className="crop-snippet">{snippet.slice(0, 160)}</span> : null}

            </div>

          ) : fetchState === "loading" ? (

            <div className="crop-status crop-loading" role="status">

              Loading page…

            </div>

          ) : previewFailed ? (

            <div className="crop-status crop-error">

              <span>Page preview unavailable.</span>

              {snippet ? <span className="crop-snippet">{snippet.slice(0, 160)}</span> : null}

            </div>

          ) : (

            <div

              className="crop-page"

              style={{ ["--crop-scroll" as string]: `${cropScroll}px` }}

            >

              {renderState === "loading" && !useIframeFallback ? (

                <div className="crop-status crop-loading" role="status">

                  Loading page…

                </div>

              ) : null}

              {useIframeFallback && embedSrc ? (

                <iframe

                  className="crop-iframe-fallback"

                  src={embedSrc}

                  title={label}

                  tabIndex={-1}

                  data-testid="case-summary-evidence-crop-iframe"

                />

              ) : blobUrl ? (

                <div className="crop-page-shift">

                  <EvidencePdfPageCanvas

                    pdfUrl={blobUrl.split("#")[0]!}

                    pageNumber={page}

                    zoom={CROP_RENDER_ZOOM}

                    activeRef={hasRegion ? evidenceRef : null}

                    showInlineError={false}

                    scrollActiveIntoView={false}

                    onRenderState={setRenderState}

                  />

                </div>

              ) : null}

            </div>

          )}

        </div>

      </button>

      {!tracePending && partialNoBox && previewReady ? (

        <p className="crop-note" data-testid="case-summary-crop-partial-note">

          Page preview shown — exact highlight is not mapped for this quote yet.

        </p>

      ) : null}

    </div>

  );

}

