import type { DocumentFactStats } from "@hiveforyou/core/pro-view-model";
import type { CaseViewV2 } from "@hiveforyou/shared/projections";

/** Claim counts per source document from validated case-view items (for Pro coverage/timeline). */
export function documentFactStatsFromCaseView(caseView: CaseViewV2): Record<string, DocumentFactStats> {
  const out: Record<string, DocumentFactStats> = {};
  for (const item of caseView.items) {
    if (item.state !== "established" && item.state !== "changed") {
      continue;
    }
    const chips =
      item.state === "changed"
        ? item.series.flatMap((p) => p.chips)
        : "chips" in item
          ? item.chips
          : [];
    const chip = chips[0];
    if (!chip) {
      continue;
    }
    const claimId =
      item.state === "established"
        ? item.claimId
        : item.series.at(-1)?.claimId;
    const key = chip.sourceDocumentId;
    const row = out[key] ?? { count: 0, pages: [], firstClaimId: claimId };
    row.count += 1;
    if (chip.page && !row.pages.includes(chip.page)) {
      row.pages.push(chip.page);
    }
    row.firstClaimId ??= claimId;
    out[key] = row;
  }
  for (const key of Object.keys(out)) {
    out[key]!.pages.sort((a, b) => a - b);
  }
  return out;
}
