import type { ResolvedEvidenceRef } from "@hiveforyou/shared/projections";

import type { ProvenanceIndex } from "@/lib/case/provenance-index";

export function evidencePageNumber(ref: ResolvedEvidenceRef): number | null {
  const page = ref.physicalPageNumber ?? ref.page ?? null;
  return page != null && !Number.isNaN(page) ? page : null;
}

function refCatalogKey(ref: ResolvedEvidenceRef): string {
  return (
    ref.id ||
    `${ref.claimId ?? ""}-${ref.sourceDocumentId ?? ""}-${evidencePageNumber(ref) ?? ""}-${ref.span?.start ?? ""}-${ref.span?.end ?? ""}`
  );
}

/** Merge bundle provenance with fresher traced refs (trace API wins on id). */
export function mergeEvidenceRefCatalog(
  provenance: ProvenanceIndex | null,
  extras: readonly ResolvedEvidenceRef[],
): ResolvedEvidenceRef[] {
  const byKey = new Map<string, ResolvedEvidenceRef>();
  for (const refs of provenance?.byClaimId.values() ?? []) {
    for (const ref of refs) {
      byKey.set(refCatalogKey(ref), ref);
    }
  }
  for (const ref of extras) {
    byKey.set(refCatalogKey(ref), ref);
  }
  return [...byKey.values()];
}

function refsOnSourcePageFromCatalog(
  catalog: readonly ResolvedEvidenceRef[],
  sourceDocumentId: string,
  page: number,
): ResolvedEvidenceRef[] {
  const seen = new Set<string>();
  const out: ResolvedEvidenceRef[] = [];
  for (const ref of catalog) {
    if (ref.sourceDocumentId !== sourceDocumentId) {
      continue;
    }
    if (evidencePageNumber(ref) !== page) {
      continue;
    }
    const key = refCatalogKey(ref);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(ref);
  }
  return out;
}

/** All traced document evidence on the same source page (for “What Hive read on this page”). */
export function refsOnSourcePage(
  provenance: ProvenanceIndex | null,
  sourceDocumentId: string,
  page: number,
  overlayRefs: readonly ResolvedEvidenceRef[] = [],
): ResolvedEvidenceRef[] {
  const catalog = mergeEvidenceRefCatalog(provenance, overlayRefs);
  return refsOnSourcePageFromCatalog(catalog, sourceDocumentId, page);
}

/** Refs that can be drawn on the page, top-to-bottom reading order. */
export function orderedRegionalRefs(refs: readonly ResolvedEvidenceRef[]): ResolvedEvidenceRef[] {
  return refs
    .filter((ref) => ref.region)
    .sort((a, b) => {
      const orderA = a.lineOrder ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.lineOrder ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      const yA = a.region?.y ?? 0;
      const yB = b.region?.y ?? 0;
      return yA - yB;
    });
}

export function countRegionalRefsOnPage(
  provenance: ProvenanceIndex | null,
  sourceDocumentId: string,
  page: number,
  overlayRefs: readonly ResolvedEvidenceRef[] = [],
): number {
  return orderedRegionalRefs(refsOnSourcePage(provenance, sourceDocumentId, page, overlayRefs)).length;
}

/**
 * Side-by-side compare: right pane (index 1) uses 1…n; left pane (index 0) continues n+1…
 * so citation IDs stay unique across both documents.
 */
export function compareMarkerNumberStarts(
  paneCount: number,
  regionalCountsByPane: readonly number[],
): number[] {
  if (paneCount < 2 || regionalCountsByPane.length < 2) {
    return regionalCountsByPane.map(() => 1);
  }
  const rightCount = regionalCountsByPane[1] ?? 0;
  return [rightCount + 1, 1];
}

/** Citation badge number per ref id (only refs with geometry). */
export function citationNumbersForPage(
  refsOnPage: readonly ResolvedEvidenceRef[],
  markerNumberStart: number,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const [index, ref] of orderedRegionalRefs(refsOnPage).entries()) {
    if (ref.id) {
      map.set(ref.id, markerNumberStart + index);
    }
  }
  return map;
}

export function pagesWithCitations(
  provenance: ProvenanceIndex | null,
  sourceDocumentId: string,
  overlayRefs: readonly ResolvedEvidenceRef[] = [],
): Set<number> {
  const pages = new Set<number>();
  for (const ref of mergeEvidenceRefCatalog(provenance, overlayRefs)) {
    if (ref.sourceDocumentId !== sourceDocumentId) {
      continue;
    }
    const page = evidencePageNumber(ref);
    if (page != null) {
      pages.add(page);
    }
  }
  return pages;
}
