import { AlertTriangle, ArrowLeft } from "lucide-react";

import type { CaseMap, CaseMapNode } from "@hiveforyou/shared/projections";

import {
  attentionsInSubtree,
  countLabel,
  findingNodesInGroup,
} from "@/lib/case-map/case-map-presentation";
import type { CaseMapIndex } from "@/lib/case-map/case-map-tree";

type CaseMapFactFocusProps = {
  map: CaseMap;
  index: CaseMapIndex;
  zoneId: string;
  groupId: string;
  factId: string;
  sourceCount: (node: CaseMapNode) => number | null;
  onSelectFact: (node: CaseMapNode) => void;
  onBackToZone: () => void;
  onRevealAttention: (nodeId: string) => void;
};

export function CaseMapFactFocus({
  map,
  index,
  zoneId,
  groupId,
  factId,
  sourceCount,
  onSelectFact,
  onBackToZone,
  onRevealAttention,
}: CaseMapFactFocusProps) {
  const zone = index.nodesById.get(zoneId);
  const group = index.nodesById.get(groupId);
  const fact = index.nodesById.get(factId);
  if (!zone || !group || !fact) {
    return null;
  }

  const siblings = findingNodesInGroup(groupId, index).filter((node) => node.id !== fact.id);
  const attention = attentionsInSubtree(map, fact.id, index);
  const headline = fact.summary?.trim() || fact.label;
  const sources = sourceCount(fact);

  return (
    <section data-testid="case-map-fact-focus" className="rounded-2xl border border-hive-border bg-hive-surface p-6 shadow-hive">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-hive-soft-sky px-2.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-hive-blue">
          Evidence
        </span>
        <button
          type="button"
          className="inline-flex items-center gap-1 font-sans text-xs font-bold text-hive-text-muted hover:text-hive-navy"
          onClick={onBackToZone}
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to {zone.label}
        </button>
      </div>
      <h2 className="mt-4 font-serif text-2xl font-bold text-hive-navy">{group.label}</h2>
      <div className="mt-4 space-y-3 rounded-2xl border-2 border-hive-sage bg-hive-sage/5 p-5 ring-4 ring-hive-sage/10">
        <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-hive-sage">
          Selected finding
        </p>
        <h3 className="font-serif text-xl font-bold text-hive-navy">{headline}</h3>
        {fact.summary && fact.label !== headline ? (
          <p className="font-sans text-sm text-hive-text-muted">{fact.label}</p>
        ) : null}
        {sources != null ? (
          <p className="border-t border-hive-sage/20 pt-2 font-mono text-xs text-hive-sage">
            {countLabel(sources, "source", "sources")}
          </p>
        ) : null}
      </div>
      {siblings.length ? (
        <div className="mt-4 space-y-2 opacity-70 transition-opacity hover:opacity-100">
          <p className="font-mono text-xs font-semibold uppercase tracking-wide text-hive-text-muted">
            Also here
          </p>
          {siblings.map((node) => (
            <button
              key={node.id}
              type="button"
              data-testid={`case-map-node-${node.kind}`}
              data-node-id={node.id}
              className="flex w-full items-center justify-between rounded-xl border border-hive-border bg-hive-surface px-3 py-2 text-left"
              onClick={() => onSelectFact(node)}
            >
              <span className="font-sans text-xs font-medium text-hive-navy">
                {node.summary?.trim() || node.label}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {attention.length ? (
        <button
          type="button"
          data-testid="case-map-attention"
          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[#B8922E]/30 bg-[#B8922E]/10 px-3 py-2 font-sans text-sm font-bold text-[#B8922E]"
          onClick={() => onRevealAttention(fact.id)}
        >
          <AlertTriangle className="h-4 w-4" aria-hidden />
          {countLabel(attention.length, "needs attention", "need attention")}
        </button>
      ) : null}
    </section>
  );
}
