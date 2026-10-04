import type { CaseViewV2 } from "@hiveforyou/shared/projections";

/** Map study fact ids (claim ids) to verified chip quotes for ledger + export. */
export function quotesByFactIdFromCaseView(caseView: CaseViewV2): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of caseView.items) {
    if (item.state === "conflicting") {
      for (const side of item.sides) {
        const quote = side.chips[0]?.quote;
        if (quote) {
          out[side.claimId] = quote;
        }
      }
      continue;
    }
    if ("claimId" in item) {
      const quote = item.chips[0]?.quote;
      if (quote) {
        out[item.claimId] = quote;
      }
    }
  }
  return out;
}
