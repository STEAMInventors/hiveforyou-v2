import type { CaseMap, CaseMapAttention } from "@hiveforyou/shared/projections";

/** Resolve where inverted attention should anchor in the map. */
export function resolveAttentionAnchorNodeId(
  map: CaseMap,
  attention: CaseMapAttention,
): string | undefined {
  if (attention.nodeId) {
    return attention.nodeId;
  }
  if (attention.claimIds?.length) {
    for (const claimId of attention.claimIds) {
      const fact = map.nodes.find(
        (node) =>
          (node.kind === "fact" || node.kind === "decision") &&
          node.claimIds?.includes(claimId),
      );
      if (fact) {
        return fact.id;
      }
    }
  }
  return undefined;
}

export function primaryAttentionItem(map: CaseMap): CaseMapAttention | undefined {
  return map.attention[0];
}

export function isInvertedAttentionStatus(status: string): boolean {
  return status === "NEEDS_REVIEW";
}
