import type { CaseMap, CaseMapAttention, CaseMapNode } from "@hiveforyou/shared/projections";

import type { ProvenanceIndex } from "@/lib/case/provenance-index";

import { resolveAttentionAnchorNodeId } from "./case-map-attention";
import { descendantIds, type CaseMapIndex } from "./case-map-tree";

const FALLBACK_ZONE_ID = "fallback";
const FINDING_KINDS = new Set(["fact", "decision"]);
const GROUP_KINDS = new Set(["construct", "change"]);

export function isFallbackZone(node: CaseMapNode): boolean {
  return node.kind === "zone" && node.zoneId === FALLBACK_ZONE_ID;
}

export function isQuietCard(node: CaseMapNode): boolean {
  return (
    isFallbackZone(node) ||
    node.kind === "ghost" ||
    node.disclosureLevel === "quiet" ||
    node.disclosureLevel === "collapsed"
  );
}

function zoneOrder(node: CaseMapNode): number {
  if (isFallbackZone(node)) {
    return Number.MAX_SAFE_INTEGER;
  }
  const parsed = Number(node.display?.order ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

export function orderedZoneNodes(map: CaseMap, index: CaseMapIndex): CaseMapNode[] {
  const zones = (index.childrenById.get(map.rootNodeId) ?? [])
    .map((id) => index.nodesById.get(id))
    .filter((node): node is CaseMapNode => node?.kind === "zone");
  return zones.sort((a, b) => {
    const order = zoneOrder(a) - zoneOrder(b);
    if (order !== 0) {
      return order;
    }
    return a.label.localeCompare(b.label, "en", { sensitivity: "base" });
  });
}

export function rootGhostNodes(map: CaseMap, index: CaseMapIndex): CaseMapNode[] {
  return (index.childrenById.get(map.rootNodeId) ?? [])
    .map((id) => index.nodesById.get(id))
    .filter((node): node is CaseMapNode => node?.kind === "ghost");
}

/** Zone cards first, fallback last, then root-level gap nodes. */
export function overviewCards(map: CaseMap, index: CaseMapIndex): CaseMapNode[] {
  return [...orderedZoneNodes(map, index), ...rootGhostNodes(map, index)];
}

export function childNodesOf(
  parentId: string,
  index: CaseMapIndex,
  kinds: Set<string>,
): CaseMapNode[] {
  const nodes: CaseMapNode[] = [];
  for (const id of index.childrenById.get(parentId) ?? []) {
    const node = index.nodesById.get(id);
    if (node && kinds.has(node.kind)) {
      nodes.push(node);
    }
  }
  return nodes;
}

export function findingCount(nodeId: string, index: CaseMapIndex): number {
  let count = 0;
  for (const id of descendantIds(nodeId, index.childrenById)) {
    const node = index.nodesById.get(id);
    if (node && FINDING_KINDS.has(node.kind)) {
      count += 1;
    }
  }
  return count;
}

export function groupNodesInZone(zoneId: string, index: CaseMapIndex): CaseMapNode[] {
  return childNodesOf(zoneId, index, GROUP_KINDS);
}

export function findingNodesInGroup(groupId: string, index: CaseMapIndex): CaseMapNode[] {
  return childNodesOf(groupId, index, FINDING_KINDS);
}

export function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function attentionByAnchor(map: CaseMap): Map<string, CaseMapAttention[]> {
  const byNode = new Map<string, CaseMapAttention[]>();
  for (const item of map.attention) {
    const anchor = resolveAttentionAnchorNodeId(map, item);
    if (!anchor) {
      continue;
    }
    const list = byNode.get(anchor) ?? [];
    list.push(item);
    byNode.set(anchor, list);
  }
  return byNode;
}

export function attentionsInSubtree(
  map: CaseMap,
  nodeId: string,
  index: CaseMapIndex,
): CaseMapAttention[] {
  const anchors = attentionByAnchor(map);
  const ids = new Set<string>([nodeId, ...descendantIds(nodeId, index.childrenById)]);
  const items: CaseMapAttention[] = [];
  for (const id of ids) {
    const rows = anchors.get(id);
    if (rows) {
      items.push(...rows);
    }
  }
  return items;
}

export function parentZoneId(nodeId: string, index: CaseMapIndex): string | null {
  let current: string | undefined = nodeId;
  while (current) {
    const node = index.nodesById.get(current);
    if (node?.kind === "zone") {
      return node.id;
    }
    current = index.parentById.get(current);
  }
  return null;
}

export function parentGroupId(nodeId: string, index: CaseMapIndex): string | null {
  let current: string | undefined = index.parentById.get(nodeId);
  while (current) {
    const node = index.nodesById.get(current);
    if (node && GROUP_KINDS.has(node.kind)) {
      return node.id;
    }
    current = index.parentById.get(current);
  }
  return null;
}

export function factNodeForClaim(map: CaseMap, claimId: string): CaseMapNode | undefined {
  return map.nodes.find(
    (node) =>
      (node.kind === "fact" || node.kind === "decision") && node.claimIds?.includes(claimId),
  );
}

export function defaultGroupId(zoneId: string, index: CaseMapIndex): string | null {
  return groupNodesInZone(zoneId, index)[0]?.id ?? null;
}

/** Unique source documents already linked on the node's claims. Null when none are linked. */
export function linkedSourceCount(
  node: CaseMapNode,
  provenance: ProvenanceIndex | null,
): number | null {
  if (!provenance || !node.claimIds?.length) {
    return null;
  }
  const sources = new Set<string>();
  for (const claimId of node.claimIds) {
    for (const ref of provenance.byClaimId.get(claimId) ?? []) {
      if (ref.sourceDocumentId) {
        sources.add(ref.sourceDocumentId);
      }
    }
  }
  return sources.size > 0 ? sources.size : null;
}
