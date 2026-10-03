import type { ResolvedEvidenceRef } from "@hiveforyou/shared/projections";

import type { ProvenanceIndex } from "@/lib/case/provenance-index";

export type CaseSummaryPanelSpec =
  | { t: "one"; claimId: string }
  | { t: "pair"; claimIdA: string; claimIdB: string; title: string }
  | {
      t: "gap";
      gapId: string;
      title: string;
      lookedFor: string;
      closestClaimId?: string;
      documentLabels: string[];
    }
  | { t: "you"; decisionId: string; question: string; pickedClaimId: string; optionClaimIds: string[] };

export function primaryRefForClaim(
  provenance: ProvenanceIndex | null,
  claimId: string,
): ResolvedEvidenceRef | null {
  const refs = provenance?.byClaimId.get(claimId) ?? [];
  return refs[0] ?? null;
}

const GENERIC_CHIP_DOC_NAMES = new Set(["source", "document"]);

/** Hide placeholder chips that carry no document identity. */
export function shouldShowEvidenceChipLabel(label: string | undefined | null): boolean {
  if (!label?.trim()) {
    return false;
  }
  const docPart = label.split(" · ")[0]?.trim().toLowerCase() ?? "";
  return !GENERIC_CHIP_DOC_NAMES.has(docPart);
}

export function chipShortLabel(ref: ResolvedEvidenceRef): string {
  const raw = ref.logicalTitle?.trim() || ref.sourceFilename?.trim() || "Source";
  const label = raw.replace(/\.pdf$/i, "").replace(/_/g, " ");
  const short = label.length > 22 ? `${label.slice(0, 20)}…` : label;
  const page = ref.physicalPageNumber ?? ref.page;
  return page != null ? `${short} · p.${page}` : short;
}

export function chipShortLabelForClaim(
  provenance: ProvenanceIndex | null,
  claimId: string,
): string | null {
  const ref = primaryRefForClaim(provenance, claimId);
  if (!ref) {
    return null;
  }
  const label = chipShortLabel(ref);
  return shouldShowEvidenceChipLabel(label) ? label : null;
}

export function docDisplayName(ref: ResolvedEvidenceRef): string {
  return ref.logicalTitle?.trim() || ref.sourceFilename?.trim() || "Document";
}

export function highlightQuote(text: string, span?: { start: number; end: number }): string {
  if (!text) {
    return "";
  }
  if (
    !span ||
    span.start < 0 ||
    span.end > text.length ||
    span.start >= span.end
  ) {
    return text;
  }
  return `${text.slice(0, span.start)}${text.slice(span.start, span.end)}${text.slice(span.end)}`;
}

export function highlightParts(
  text: string,
  span?: { start: number; end: number },
): { before: string; mark: string; after: string } {
  if (
    !span ||
    span.start < 0 ||
    span.end > text.length ||
    span.start >= span.end
  ) {
    return { before: text, mark: "", after: "" };
  }
  return {
    before: text.slice(0, span.start),
    mark: text.slice(span.start, span.end),
    after: text.slice(span.end),
  };
}

export function pageCropY(ref: ResolvedEvidenceRef): number {
  if (ref.region && ref.region.height > 0) {
    return Math.min(0.92, Math.max(0.08, ref.region.y));
  }
  if (ref.lineOrder != null) {
    return Math.min(0.85, Math.max(0.12, ref.lineOrder / 12));
  }
  return 0.42;
}

/** Pixel scroll offset for drawer crop preview (keeps evidence band inside the preview box). */
export function pageCropScrollTop(
  ref: ResolvedEvidenceRef,
  viewportHeightPx = 240,
  scale = 0.68,
): number {
  const pageHeightPx = 792 * scale;
  const maxScroll = Math.max(0, pageHeightPx - viewportHeightPx);

  if (ref.region && ref.region.height > 0 && ref.region.y <= 1 && ref.region.width <= 1) {
    const centerY = (ref.region.y + ref.region.height / 2) * pageHeightPx;
    return Math.min(maxScroll, Math.max(0, centerY - viewportHeightPx / 2));
  }

  const anchorY = pageCropY(ref) * pageHeightPx;
  return Math.min(maxScroll, Math.max(0, anchorY - viewportHeightPx * 0.38));
}
