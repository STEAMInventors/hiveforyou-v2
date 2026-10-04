"use client";

import type { CaseMap, CaseMapAttention, CaseMapNode } from "@hiveforyou/shared/projections";

import { buildCaseMapIndex, factNodeVisible } from "@/lib/case-map/case-map-tree";

type CaseMapOutlineProps = {
  map: CaseMap;
  expandedNodeIds: Set<string>;
  selectedNodeId: string | null;
  attentionItems: CaseMapAttention[];
  onToggleExpand: (nodeId: string) => void;
  onSelectNode: (nodeId: string) => void;
  onOpenFactEvidence: (node: CaseMapNode) => void;
};

export function CaseMapOutline({
  map,
  expandedNodeIds,
  selectedNodeId,
  attentionItems,
  onToggleExpand,
  onSelectNode,
  onOpenFactEvidence,
}: CaseMapOutlineProps) {
  const index = buildCaseMapIndex(map);
  const attentionNodeIds = new Set(
    attentionItems.map((item) => item.nodeId).filter((id): id is string => Boolean(id)),
  );

  return (
    <nav
      data-testid="case-map-outline"
      aria-label="Case map outline"
      className="rounded-hive-xl border border-hive-border bg-hive-surface p-4"
    >
      <OutlineBranch
        nodeId={map.rootNodeId}
        depth={0}
        index={index}
        expandedNodeIds={expandedNodeIds}
        selectedNodeId={selectedNodeId}
        attentionNodeIds={attentionNodeIds}
        onToggleExpand={onToggleExpand}
        onSelectNode={onSelectNode}
        onOpenFactEvidence={onOpenFactEvidence}
      />
    </nav>
  );
}

type OutlineBranchProps = {
  nodeId: string;
  depth: number;
  index: ReturnType<typeof buildCaseMapIndex>;
  expandedNodeIds: Set<string>;
  selectedNodeId: string | null;
  attentionNodeIds: Set<string>;
  onToggleExpand: (nodeId: string) => void;
  onSelectNode: (nodeId: string) => void;
  onOpenFactEvidence: (node: CaseMapNode) => void;
};

function OutlineBranch({
  nodeId,
  depth,
  index,
  expandedNodeIds,
  selectedNodeId,
  attentionNodeIds,
  onToggleExpand,
  onSelectNode,
  onOpenFactEvidence,
}: OutlineBranchProps) {
  const node = index.nodesById.get(nodeId);
  if (!node) {
    return null;
  }

  const children = index.childrenById.get(nodeId) ?? [];
  const expandable = node.kind === "zone" || node.kind === "construct";
  const expanded = expandedNodeIds.has(nodeId);
  const isAttention = attentionNodeIds.has(nodeId);

  const visibleChildren = children.filter((childId) => {
    const child = index.nodesById.get(childId);
    if (!child) {
      return false;
    }
    if (child.kind === "fact" || child.kind === "decision") {
      return factNodeVisible(child, expandedNodeIds.has(nodeId));
    }
    return true;
  });

  return (
    <div role="treeitem" aria-expanded={expandable ? expanded : undefined} className="outline-none">
      <div
        className={[
          "flex items-center gap-2 rounded-hive py-1 pr-2",
          selectedNodeId === nodeId ? "bg-hive-soft-sky/60" : "",
          node.disclosureLevel === "quiet" ? "opacity-70" : "",
        ].join(" ")}
        style={{ paddingLeft: depth * 14 }}
      >
        {expandable ? (
          <button
            type="button"
            aria-label={expanded ? "Collapse" : "Expand"}
            className="font-mono text-xs text-hive-text-muted"
            onClick={() => onToggleExpand(nodeId)}
          >
            {expanded ? "−" : "+"}
          </button>
        ) : (
          <span className="w-4" aria-hidden />
        )}
        <button
          type="button"
          data-testid={`outline-node-${node.kind}`}
          className="flex-1 text-left font-sans text-sm text-hive-navy hover:underline"
          onClick={() => {
            onSelectNode(nodeId);
            if (node.kind === "fact" || node.kind === "decision") {
              onOpenFactEvidence(node);
            } else if (expandable) {
              onToggleExpand(nodeId);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onSelectNode(nodeId);
              if (node.kind === "fact" || node.kind === "decision") {
                onOpenFactEvidence(node);
              }
            }
          }}
        >
          {node.label}
          {node.summary && (node.kind === "fact" || node.kind === "decision") ? (
            <span className="block text-xs text-hive-text-muted">{node.summary}</span>
          ) : null}
        </button>
        {isAttention ? (
          <span className="font-sans text-[10px] font-semibold uppercase text-hive-sage">
            Attention
          </span>
        ) : null}
      </div>
      {expanded
        ? visibleChildren.map((childId) => (
            <OutlineBranch
              key={childId}
              nodeId={childId}
              depth={depth + 1}
              index={index}
              expandedNodeIds={expandedNodeIds}
              selectedNodeId={selectedNodeId}
              attentionNodeIds={attentionNodeIds}
              onToggleExpand={onToggleExpand}
              onSelectNode={onSelectNode}
              onOpenFactEvidence={onOpenFactEvidence}
            />
          ))
        : null}
    </div>
  );
}
