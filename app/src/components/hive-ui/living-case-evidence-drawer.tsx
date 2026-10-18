"use client";

import { useEffect, useRef } from "react";

import type { CanonicalStudyReportEvidenceChip } from "@hiveforyou/shared/canonical-study-report-projection";

import { buildSourceDocumentFileHref } from "@/lib/evidence/source-document-file-client";

export function LivingCaseEvidenceDrawer({
  studyRunId,
  chip,
  citationNumber,
  onClose,
}: {
  studyRunId: string;
  chip: CanonicalStudyReportEvidenceChip;
  citationNumber: number;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const sourceHref = buildSourceDocumentFileHref(studyRunId, chip.sourceDocumentId, chip.page);

  return (
    <>
      <button
        type="button"
        className="hir-evidence-backdrop"
        aria-label="Close evidence"
        onClick={onClose}
      />
      <aside
        className="hir-evidence-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hir-evidence-drawer-title"
        data-testid="living-case-evidence-drawer"
      >
        <div className="hir-evidence-drawer__header">
          <p id="hir-evidence-drawer-title" className="hir-evidence-drawer__title">
            Source {citationNumber}
          </p>
          <button
            ref={closeRef}
            type="button"
            className="hir-evidence-drawer__close"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <p className="hir-evidence-drawer__meta">
          Document <span className="font-mono">{chip.sourceDocumentId}</span> · page {chip.page}
        </p>
        <blockquote className="hir-evidence-drawer__quote">{chip.quote}</blockquote>
        <a href={sourceHref} className="hir-btn-secondary hir-evidence-drawer__open">
          Open document
        </a>
      </aside>
    </>
  );
}
