import type { CaseMap, CaseMapNode } from "@hiveforyou/shared/projections";

export type CaseMapIndex = {
  nodesById: Map<string, CaseMapNode>;
  childrenById: Map<string, string[]>;
  parentById: Map<string, string>;
};

export function buildCaseMapIndex(map: CaseMap): CaseMapIndex {
  const nodesById = new Map(map.nodes.map((node) => [node.id, node]));
  const childrenById = new Map<string, string[]>();
  const parentById = new Map<string, string>();

  for (const edge of map.edges) {
    if (edge.kind !== "contains") {
      continue;
    }
    const siblings = childrenById.get(edge.fromNodeId) ?? [];
    siblings.push(edge.toNodeId);
    childrenById.set(edge.fromNodeId, siblings);
    parentById.set(edge.toNodeId, edge.fromNodeId);
  }

  for (const [id, children] of childrenById) {
    children.sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
    childrenById.set(id, children);
  }

  return { nodesById, childrenById, parentById };
}

export function pathToRoot(nodeId: string, parentById: Map<string, string>): string[] {
  const path: string[] = [nodeId];
  let current = parentById.get(nodeId);
  while (current) {
    path.unshift(current);
    current = parentById.get(current);
  }
  return path;
}

export function descendantIds(
  rootId: string,
  childrenById: Map<string, string[]>,
): Set<string> {
  const result = new Set<string>();
  const stack = [...(childrenById.get(rootId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (result.has(id)) {
      continue;
    }
    result.add(id);
    stack.push(...(childrenById.get(id) ?? []));
  }
  return result;
}

export function zoneChildSummary(
  zoneId: string,
  index: CaseMapIndex,
): { constructCount: number; factCount: number; attentionCount: number } {
  const children = index.childrenById.get(zoneId) ?? [];
  let constructCount = 0;
  let factCount = 0;
  for (const childId of children) {
    const child = index.nodesById.get(childId);
    if (!child) {
      continue;
    }
    if (child.kind === "construct" || child.kind === "change") {
      constructCount += 1;
      const facts = index.childrenById.get(childId) ?? [];
      factCount += facts.filter((id) => {
        const node = index.nodesById.get(id);
        return node?.kind === "fact" || node?.kind === "decision";
      }).length;
    }
  }
  return { constructCount, factCount, attentionCount: 0 };
}

export function factNodeVisible(
  node: CaseMapNode,
  constructExpanded: boolean,
): boolean {
  if (node.kind !== "fact" && node.kind !== "decision") {
    return true;
  }
  if (!constructExpanded) {
    return false;
  }
  if (node.disclosureLevel === "collapsed") {
    return false;
  }
  return true;
}
