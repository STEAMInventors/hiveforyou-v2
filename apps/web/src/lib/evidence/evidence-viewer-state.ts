import type { ResolvedEvidenceRef } from "@hiveforyou/shared/projections";

import { docDisplayName } from "@/lib/case-summary/case-summary-evidence";

import { evidencePageNumber } from "./evidence-page-facts";

export type EvidenceViewerPaneState = {
  ref: ResolvedEvidenceRef;
  roleLabel: string;
  page: number;
  activeRefId: string | null;
};

export type EvidenceViewerLaunch = {
  mode: "single" | "compare";
  panes: EvidenceViewerPaneState[];
  tab: number;
};

function makePane(ref: ResolvedEvidenceRef, roleLabel?: string): EvidenceViewerPaneState {
  return {
    ref,
    roleLabel: roleLabel?.trim() || docDisplayName(ref),
    page: evidencePageNumber(ref) ?? 1,
    activeRefId: ref.id,
  };
}

export function launchViewerSingle(ref: ResolvedEvidenceRef, roleLabel?: string): EvidenceViewerLaunch {
  return { mode: "single", panes: [makePane(ref, roleLabel)], tab: 0 };
}

export function launchViewerFromPair(
  which: "a" | "b" | "both",
  a: ResolvedEvidenceRef,
  b: ResolvedEvidenceRef,
  labelA?: string,
  labelB?: string,
): EvidenceViewerLaunch {
  const paneA = makePane(a, labelA);
  const paneB = makePane(b, labelB);
  if (which === "both") {
    return { mode: "compare", panes: [paneA, paneB], tab: 0 };
  }
  if (which === "b") {
    return { mode: "single", panes: [paneB, paneA], tab: 0 };
  }
  return { mode: "single", panes: [paneA, paneB], tab: 0 };
}
