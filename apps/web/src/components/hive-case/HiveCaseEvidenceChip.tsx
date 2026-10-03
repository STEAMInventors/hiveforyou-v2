"use client";

import type { Chip } from "@hiveforyou/shared/projections";
import type { ProvenanceIndex } from "@/lib/case/provenance-index";
import type { CaseSummaryPanelSpec } from "@/lib/case-summary/case-summary-evidence";
import { chipLabel } from "@/lib/case-summary/build-case-view-v2-presentation";

import { HfyChipButton, HfyChipStatic } from "@/components/hfy/HfyChip";

import { PairEvidenceChip, SourceEvidenceChip } from "../case-summary/CaseSummaryChips";

export function HiveCaseChipButton({
  chip,
  onOpenFromClaim,
}: {
  chip: Chip;
  onOpenFromClaim?: (claimId: string) => void;
}) {
  const label = chipLabel(chip);
  if (onOpenFromClaim) {
    return (
      <HfyChipButton
        data-testid="hive-case-chip"
        onClick={() => onOpenFromClaim(chip.evidenceId)}
      >
        {label}
      </HfyChipButton>
    );
  }
  return (
    <HfyChipStatic data-testid="hive-case-chip">
      {label}
    </HfyChipStatic>
  );
}

export function HiveCaseClaimChips({
  claimIds,
  provenance,
  onOpen,
  pairTitle,
}: {
  claimIds: string[];
  provenance: ProvenanceIndex | null;
  onOpen: (spec: CaseSummaryPanelSpec) => void;
  pairTitle?: string;
}) {
  if (claimIds.length >= 2 && pairTitle) {
    return (
      <PairEvidenceChip
        claimIdA={claimIds[0]!}
        claimIdB={claimIds[1]!}
        title={pairTitle}
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
