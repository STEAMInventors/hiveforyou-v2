import { AlertTriangle, ArrowLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import type { CaseMap, CaseMapNode } from "@hiveforyou/shared/projections";

import {
  attentionsInSubtree,
  countLabel,
  findingCount,
  findingNodesInGroup,
  groupNodesInZone,
  orderedZoneNodes,
} from "@/lib/case-map/case-map-presentation";
import type { CaseMapIndex } from "@/lib/case-map/case-map-tree";

type CaseMapZoneFocusProps = {
  map: CaseMap;
  index: CaseMapIndex;
  zoneId: string;
  groupId: string | null;
  sourceCount: (node: CaseMapNode) => number | null;
  onSelectZone: (zoneId: string) => void;
  onSelectGroup: (groupId: string) => void;
  onOpenFact: (node: CaseMapNode) => void;
  onBack: () => void;
  onRevealAttention: (nodeId: string) => void;
};

export function CaseMapZoneFocus({
  map,
  index,
  zoneId,
  groupId,
  sourceCount,
  onSelectZone,
  onSelectGroup,
  onOpenFact,
  onBack,
  onRevealAttention,
}: CaseMapZoneFocusProps) {
  const zone = index.nodesById.get(zoneId);
  const zones = orderedZoneNodes(map, index);
  const groups = groupNodesInZone(zoneId, index);
  const selected = groups.find((node) => node.id === groupId) ?? null;
  const siblings = groups.filter((node) => node.id !== selected?.id);
  const zoneAttention = attentionsInSubtree(map, zoneId, index);

  if (!zone) {
    return null;
  }

  return (
    <section data-testid="case-map-zone-focus" className="w-full">
      <div className="mb-6 flex items-center gap-3 overflow-x-auto border-b border-hive-border/80 pb-4">
        <span className="shrink-0 font-mono text-xs text-hive-text-muted">Areas</span>
        <div className="flex items-center gap-2">
          {zones.map((item) => {
            const current = item.id === zoneId;
            const count = findingCount(item.id, index);
            const flagged = attentionsInSubtree(map, item.id, index).length > 0;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={current ? "true" : undefined}
                data-testid={current ? "case-map-zone-current" : "case-map-zone-sibling"}
                className={[
                  "inline-flex shrink-0 items-center gap-1 rounded px-2.5 py-1 font-mono text-[11px]",
                  current
                    ? "bg-hive-navy font-bold text-white shadow-hive"
                    : "border border-hive-border bg-hive-surface text-hive-text-muted hover:text-hive-navy",
                ].join(" ")}
                onClick={() => onSelectZone(item.id)}
              >
                <span>
                  {item.label} ({count})
                </span>
                {flagged ? <span className="h-1.5 w-1.5 rounded-full bg-[#B8922E]" aria-hidden /> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-6 flex flex-col justify-between gap-4 rounded-2xl border border-hive-border bg-hive-surface p-6 shadow-hive md:flex-row md:items-center">
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-hive-blue">
            Focus
          </p>
          <h2 className="mt-1 font-serif text-2xl font-bold text-hive-navy">{zone.label}</h2>
          <p className="mt-1 font-sans text-sm text-hive-text-muted">
            {countLabel(findingCount(zone.id, index), "finding", "findings")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {zoneAttention.length ? (
            <button
              type="button"
              data-testid="case-map-attention"
              className="inline-flex items-center gap-2 rounded-xl border border-[#B8922E]/40 bg-[#B8922E]/10 px-3.5 py-2 font-sans text-sm font-bold text-[#B8922E]"
              onClick={() => onRevealAttention(zone.id)}
            >
              <AlertTriangle className="h-4 w-4" aria-hidden />
              {countLabel(zoneAttention.length, "needs attention", "need attention")}
            </button>
          ) : null}
          <button
            type="button"
            data-testid="case-map-back"
            className="inline-flex items-center gap-1.5 rounded-xl border border-hive-border bg-hive-surface px-3.5 py-2 font-sans text-sm font-bold text-hive-text-muted shadow-hive hover:text-hive-navy"
            onClick={onBack}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to case
          </button>
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="font-sans text-sm text-hive-text-muted">Nothing recorded in this area yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {selected ? (
            <SelectedGroup
              map={map}
              index={index}
              node={selected}
              alone={siblings.length === 0}
              sourceCount={sourceCount}
              onOpenFact={onOpenFact}
              onRevealAttention={onRevealAttention}
            />
          ) : null}
          {siblings.length ? (
            <div className="space-y-5">
              {siblings.map((node) => (
                <SiblingGroup
                  key={node.id}
                  map={map}
                  index={index}
                  node={node}
                  onSelect={() => onSelectGroup(node.id)}
                />
              ))}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function SelectedGroup({
  map,
  index,
  node,
  alone,
  sourceCount,
  onOpenFact,
  onRevealAttention,
}: {
  map: CaseMap;
  index: CaseMapIndex;
  node: CaseMapNode;
  alone: boolean;
  sourceCount: (node: CaseMapNode) => number | null;
  onOpenFact: (node: CaseMapNode) => void;
  onRevealAttention: (nodeId: string) => void;
}) {
  const [showCollapsed, setShowCollapsed] = useState(false);
  const facts = findingNodesInGroup(node.id, index);
  const hidden = facts.filter((fact) => fact.disclosureLevel === "collapsed");
  const visible = facts.filter(
    (fact) => fact.disclosureLevel !== "collapsed" || showCollapsed,
  );
  const flagged = attentionsInSubtree(map, node.id, index).length > 0;

  return (
    <div
      className={[
        "space-y-5 rounded-2xl border-2 border-hive-sage/60 bg-hive-surface p-6 shadow-hive",
        alone ? "lg:col-span-3" : "lg:col-span-2",
      ].join(" ")}
      data-testid={`case-map-node-${node.kind}`}
      data-node-id={node.id}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-hive-sage" aria-hidden />
            <h3 className="font-sans text-base font-bold text-hive-navy">{node.label}</h3>
            {flagged ? <span className="h-2 w-2 rounded-full bg-[#B8922E]" aria-hidden /> : null}
          </div>
          {node.summary ? (
            <p className="mt-1 font-sans text-sm text-hive-text-muted">{node.summary}</p>
          ) : null}
          <p className="mt-1 font-mono text-[11px] text-hive-sage">
            {countLabel(facts.length, "finding", "findings")}
          </p>
        </div>
      </div>
      {visible.length ? (
        <div className="space-y-3">
          {visible.map((fact) => (
            <FactRow
              key={fact.id}
              map={map}
              index={index}
              fact={fact}
              sources={sourceCount(fact)}
              onOpen={() => onOpenFact(fact)}
              onRevealAttention={() => onRevealAttention(fact.id)}
            />
          ))}
        </div>
      ) : null}
      {hidden.length && !showCollapsed ? (
        <button
          type="button"
          className="font-mono text-xs text-hive-text-muted hover:text-hive-navy"
          onClick={() => setShowCollapsed(true)}
        >
          Show {countLabel(hidden.length, "more finding", "more findings")}
        </button>
      ) : null}
    </div>
  );
}

function FactRow({
  map,
  index,
  fact,
  sources,
  onOpen,
  onRevealAttention,
}: {
  map: CaseMap;
  index: CaseMapIndex;
  fact: CaseMapNode;
  sources: number | null;
  onOpen: () => void;
  onRevealAttention: () => void;
}) {
  const attention = attentionsInSubtree(map, fact.id, index);
  const headline = fact.summary?.trim() || fact.label;
  return (
    <div
      className={[
        "rounded-xl border p-4",
        fact.disclosureLevel === "prominent"
          ? "border-hive-sage/50 bg-hive-soft-sky/40"
          : "border-hive-border bg-hive-surface",
      ].join(" ")}
    >
      <button
        type="button"
        data-testid={`case-map-node-${fact.kind}`}
        data-node-id={fact.id}
        className="flex w-full items-start justify-between gap-3 text-left"
        onClick={onOpen}
      >
        <span>
          <span className="font-sans text-sm font-bold text-hive-navy">{headline}</span>
          {fact.summary && fact.label !== fact.summary ? (
            <span className="mt-1 block font-sans text-sm text-hive-text-muted">{fact.label}</span>
          ) : null}
          {sources != null ? (
            <span className="mt-2 inline-flex rounded-full bg-hive-soft-sky px-2 py-0.5 font-mono text-[11px] text-hive-blue">
              {countLabel(sources, "source", "sources")}
            </span>
          ) : null}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 font-mono text-xs font-bold text-hive-sage">
          Evidence
          <ChevronRight className="h-4 w-4" aria-hidden />
        </span>
      </button>
      {attention.length ? (
        <button
          type="button"
          data-testid="case-map-attention"
          className="mt-2 inline-flex items-center gap-1 font-mono text-[10px] font-semibold text-[#B8922E]"
          onClick={onRevealAttention}
        >
          <AlertTriangle className="h-3 w-3" aria-hidden />
          {countLabel(attention.length, "needs attention", "need attention")}
        </button>
      ) : null}
    </div>
  );
}

function SiblingGroup({
  map,
  index,
  node,
  onSelect,
}: {
  map: CaseMap;
  index: CaseMapIndex;
  node: CaseMapNode;
  onSelect: () => void;
}) {
  const facts = findingNodesInGroup(node.id, index);
  const flagged = attentionsInSubtree(map, node.id, index).length > 0;
  return (
    <button
      type="button"
      data-testid={`case-map-node-${node.kind}`}
      data-node-id={node.id}
      className="w-full rounded-2xl border border-hive-border bg-hive-surface p-5 text-left shadow-hive hover:border-hive-sage/50"
      onClick={onSelect}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-hive-blue" aria-hidden />
          <span className="font-sans text-base font-bold text-hive-navy">{node.label}</span>
          {flagged ? <span className="h-2 w-2 rounded-full bg-[#B8922E]" aria-hidden /> : null}
        </span>
      </span>
      {node.summary ? (
        <span className="mt-2 block font-sans text-sm text-hive-text-muted">{node.summary}</span>
      ) : null}
      <span className="mt-3 block border-t border-hive-border/60 pt-2 font-mono text-xs text-hive-text-muted">
        {countLabel(facts.length, "finding", "findings")}
      </span>
    </button>
  );
}
