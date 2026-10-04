"use client";

import { HfyChipButton, HfyChipStatic } from "@/components/hfy/HfyChip";
import type { ProvenanceIndex } from "@/lib/case/provenance-index";
import {
  chipShortLabel,
  chipShortLabelForClaim,
  primaryRefForClaim,
  shouldShowEvidenceChipLabel,
  type CaseSummaryPanelSpec,
} from "@/lib/case-summary/case-summary-evidence";

export function SourceEvidenceChip({
  claimId,
  provenance,
  onOpen,
}: {
  claimId: string;
  provenance: ProvenanceIndex | null;
  onOpen: (spec: CaseSummaryPanelSpec) => void;
}) {
  const label = chipShortLabelForClaim(provenance, claimId);
  if (!label) {
    return null;
  }
  return (
    <HfyChipButton
      data-testid="case-summary-evidence-chip"
      aria-label={`Open evidence: ${label}`}
      onClick={(event) => {
        event.stopPropagation();
        if (typeof onOpen !== "function") {
          return;
        }
        onOpen({ t: "one", claimId });
      }}
    >
      {label}
    </HfyChipButton>
  );
}

export function PairEvidenceChip({
  claimIdA,
  claimIdB,
  title,
  provenance,
  onOpen,
}: {
  claimIdA?: string;
  claimIdB?: string;
  title: string;
  provenance: ProvenanceIndex | null;
  onOpen: (spec: CaseSummaryPanelSpec) => void;
}) {
  if (!claimIdA || !claimIdB) {
    return null;
  }
  const a = primaryRefForClaim(provenance, claimIdA);
  const b = primaryRefForClaim(provenance, claimIdB);
  const labelA = a ? chipShortLabel(a) : "Prior";
  const labelB = b ? chipShortLabel(b) : "Current";
  if (!shouldShowEvidenceChipLabel(labelA) || !shouldShowEvidenceChipLabel(labelB)) {
    return null;
  }
  return (
    <HfyChipButton
      data-testid="case-summary-pair-chip"
      aria-label={`Compare ${labelA} with ${labelB}`}
      onClick={() => onOpen({ t: "pair", claimIdA, claimIdB, title })}
    >
      {labelA} <span className="hfy-chip__arrow">→</span> {labelB}
    </HfyChipButton>
  );
}

export function SearchedEvidenceChip({
  gapId,
  title,
  lookedFor,
  closestClaimId,
  documentLabels,
  documentCount,
  onOpen,
}: {
  gapId: string;
  title: string;
  lookedFor: string;
  closestClaimId?: string;
  documentLabels: string[];
  documentCount: number;
  onOpen: (spec: CaseSummaryPanelSpec) => void;
}) {
  return (
    <HfyChipButton
      variant="searched"
      data-testid="case-summary-searched-chip"
      onClick={() =>
        onOpen({
          t: "gap",
          gapId,
          title,
          lookedFor,
          closestClaimId,
          documentLabels,
        })
      }
    >
      Searched {documentCount} documents
    </HfyChipButton>
  );
}

export function YouConfirmedChip({
  decisionId,
  question,
  pickedClaimId,
  optionClaimIds,
  confirmLabel,
  onOpen,
}: {
  decisionId: string;
  question: string;
  pickedClaimId?: string;
  optionClaimIds: string[];
  confirmLabel: string;
  onOpen: (spec: CaseSummaryPanelSpec) => void;
}) {
  if (!pickedClaimId) {
    return (
      <HfyChipStatic variant="you">
        You confirmed · {confirmLabel}
      </HfyChipStatic>
    );
  }
  return (
    <HfyChipButton
      variant="you"
      data-testid="case-summary-you-chip"
      onClick={() =>
        onOpen({
          t: "you",
          decisionId,
          question,
          pickedClaimId,
          optionClaimIds,
        })
      }
    >
      You confirmed · {confirmLabel}
    </HfyChipButton>
  );
}

export function CheckedEvidenceChip({
  claimIds,
  title,
  provenance,
  onOpen,
}: {
  claimIds: string[];
  title: string;
  provenance: ProvenanceIndex | null;
  onOpen: (spec: CaseSummaryPanelSpec) => void;
}) {
  if (claimIds.length >= 2) {
    return (
      <PairEvidenceChip
        claimIdA={claimIds[0]}
        claimIdB={claimIds[1]}
        title={title}
        provenance={provenance}
        onOpen={onOpen}
      />
    );
  }
  if (claimIds[0]) {
    return <SourceEvidenceChip claimId={claimIds[0]} provenance={provenance} onOpen={onOpen} />;
  }
  return null;
}
