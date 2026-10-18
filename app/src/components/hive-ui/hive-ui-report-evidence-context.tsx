"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { CanonicalStudyReportEvidenceChip } from "@hiveforyou/shared/canonical-study-report-projection";

import { LivingCaseEvidenceDrawer } from "./living-case-evidence-drawer";

type CitationKey = string;

function citationKeyForChip(chip: CanonicalStudyReportEvidenceChip): CitationKey {
  return `${chip.claimRef.fieldKey}:${chip.sourceDocumentId}:${chip.page}`;
}

type HiveUiReportEvidenceContextValue = {
  studyRunId: string;
  citationNumberForChip: (chip: CanonicalStudyReportEvidenceChip) => number;
  openEvidence: (chip: CanonicalStudyReportEvidenceChip) => void;
};

const HiveUiReportEvidenceContext = createContext<HiveUiReportEvidenceContextValue | null>(null);

export function HiveUiReportEvidenceProvider({
  studyRunId,
  children,
}: {
  studyRunId: string;
  children: ReactNode;
}) {
  const citationMapRef = useRef(new Map<CitationKey, number>());
  const [activeChip, setActiveChip] = useState<CanonicalStudyReportEvidenceChip | null>(null);

  const citationNumberForChip = useCallback((chip: CanonicalStudyReportEvidenceChip) => {
    const key = citationKeyForChip(chip);
    const map = citationMapRef.current;
    const existing = map.get(key);
    if (existing != null) {
      return existing;
    }
    const next = map.size + 1;
    map.set(key, next);
    return next;
  }, []);

  const openEvidence = useCallback((chip: CanonicalStudyReportEvidenceChip) => {
    citationNumberForChip(chip);
    setActiveChip(chip);
  }, [citationNumberForChip]);

  const closeEvidence = useCallback(() => {
    setActiveChip(null);
  }, []);

  const value = useMemo(
    () => ({
      studyRunId,
      citationNumberForChip,
      openEvidence,
    }),
    [citationNumberForChip, openEvidence, studyRunId],
  );

  const activeCitation = activeChip ? citationNumberForChip(activeChip) : null;

  return (
    <HiveUiReportEvidenceContext.Provider value={value}>
      {children}
      {activeChip && activeCitation != null ? (
        <LivingCaseEvidenceDrawer
          studyRunId={studyRunId}
          chip={activeChip}
          citationNumber={activeCitation}
          onClose={closeEvidence}
        />
      ) : null}
    </HiveUiReportEvidenceContext.Provider>
  );
}

export function useHiveUiReportEvidence(): HiveUiReportEvidenceContextValue {
  const value = useContext(HiveUiReportEvidenceContext);
  if (!value) {
    throw new Error("useHiveUiReportEvidence requires HiveUiReportEvidenceProvider");
  }
  return value;
}

export function useOptionalHiveUiReportEvidence(): HiveUiReportEvidenceContextValue | null {
  return useContext(HiveUiReportEvidenceContext);
}
