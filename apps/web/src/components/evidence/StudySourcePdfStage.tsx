"use client";

import { useEffect } from "react";

import type { ResolvedEvidenceRef } from "@hiveforyou/shared/projections";

import { loadPdfDocument } from "@/lib/evidence/pdf-document-client";
import { buildSourceDocumentFileHref } from "@/lib/evidence/source-document-file-client";
import { useStudyPdfBlobUrl } from "@/lib/evidence/use-study-pdf-blob-url";

import { EvidencePdfPageCanvas } from "./EvidencePdfPageCanvas";

type StudySourcePdfStageProps = {
  studyRunId: string;
  sourceDocumentId: string | undefined;
  sourceFilename?: string | null;
  pageNumber: number;
  zoom: number;
  activeRef: ResolvedEvidenceRef | null;
  factsOnPage?: ResolvedEvidenceRef[];
  scrollActiveIntoView?: boolean;
  onPageCount?: (sourceDocumentId: string, numPages: number) => void;
  markerNumberStart?: number;
};

/** Fetch study PDF via authenticated API → blob URL, then render with PDF.js (same path as drawer crop). */
export function StudySourcePdfStage({
  studyRunId,
  sourceDocumentId,
  sourceFilename,
  pageNumber,
  zoom,
  activeRef,
  factsOnPage,
  scrollActiveIntoView,
  onPageCount,
  markerNumberStart,
}: StudySourcePdfStageProps) {
  const apiUrl = sourceDocumentId
    ? buildSourceDocumentFileHref(studyRunId, sourceDocumentId, null, {
        originalFilename: sourceFilename,
      })
    : null;
  const { state: fetchState, blobUrl } = useStudyPdfBlobUrl(apiUrl, Boolean(sourceDocumentId));

  useEffect(() => {
    if (!blobUrl || !sourceDocumentId) {
      return;
    }
    const cleanUrl = blobUrl.split("#")[0]!;
    void loadPdfDocument(cleanUrl).then((pdf) => {
      onPageCount?.(sourceDocumentId, pdf.numPages);
    });
  }, [blobUrl, sourceDocumentId, onPageCount]);

  if (!sourceDocumentId) {
    return <p className="page-load-err">No document file linked.</p>;
  }
  if (fetchState === "loading") {
    return <p className="page-load-err" role="status">Loading document…</p>;
  }
  if (fetchState === "error" || !blobUrl) {
    return (
      <p className="page-load-err">Could not open this PDF. Try downloading the original below.</p>
    );
  }

  return (
    <EvidencePdfPageCanvas
      pdfUrl={blobUrl.split("#")[0]!}
      pageNumber={pageNumber}
      zoom={zoom}
      activeRef={activeRef}
      factsOnPage={factsOnPage}
      scrollActiveIntoView={scrollActiveIntoView}
      markerNumberStart={markerNumberStart}
    />
  );
}
