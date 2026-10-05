import type { CaseItemV2, CaseViewV2 } from "@hiveforyou/shared/projections";

export function claimIdsForCaseItem(item: CaseItemV2 | undefined): string[] {
  if (!item) {
    return [];
  }
  if (item.state === "established") {
    return [item.claimId];
  }
  if (item.state === "changed") {
    const ids = item.series.map((p) => p.claimId);
    return ids.length > 0 ? ids : [];
  }
  if (item.state === "conflicting") {
    return item.sides.map((s) => s.claimId);
  }
  return [];
}

export function claimIdsForItemId(caseView: CaseViewV2 | null, itemId: string): string[] {
  if (!caseView) {
    return [];
  }
  const item = caseView.items.find((i) => i.itemId === itemId);
  return claimIdsForCaseItem(item);
}
