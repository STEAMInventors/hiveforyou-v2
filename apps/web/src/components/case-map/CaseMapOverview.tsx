import type { CSSProperties } from "react";
import { AlertTriangle, ArrowUpRight, ChevronRight } from "lucide-react";

import type { CaseMap, CaseMapNode } from "@hiveforyou/shared/projections";

import {
  attentionsInSubtree,
  countLabel,
  findingCount,
  isQuietCard,
  orderedZoneNodes,
  overviewCards,
} from "@/lib/case-map/case-map-presentation";
import type { CaseMapIndex } from "@/lib/case-map/case-map-tree";

type CaseMapOverviewProps = {
  map: CaseMap;
  index: CaseMapIndex;
  onOpenZone: (zoneId: string) => void;
  onOpenGhost: (node: CaseMapNode) => void;
  onRevealAttention: (nodeId: string) => void;
};

export function CaseMapOverview({
  map,
  index,
  onOpenZone,
  onOpenGhost,
  onRevealAttention,
}: CaseMapOverviewProps) {
  const root = index.nodesById.get(map.rootNodeId);
  const zones = orderedZoneNodes(map, index);
  const cards = overviewCards(map, index);
  const findingTotal = map.nodes.filter(
    (node) => node.kind === "fact" || node.kind === "decision",
  ).length;
  const columns = Math.min(Math.max(cards.length, 1), 7);
  const gridStyle = { "--zone-columns": String(columns) } as CSSProperties;

  return (
    <div
      data-testid="case-map-overview"
      className="relative z-10 mx-auto flex w-full max-w-7xl flex-col items-center px-4 pb-10 pt-2"
    >
      <article
        id="case-map-root"
        className="relative z-20 w-full max-w-md rounded-2xl border border-hive-border bg-hive-surface p-6 text-center shadow-hive transition-shadow hover:shadow-hive-md"
      >
        <p className="mb-2 inline-flex rounded-full bg-hive-page px-2.5 py-0.5 font-mono text-xs text-hive-sage">
          {countLabel(zones.length, "area", "areas")} · {countLabel(findingTotal, "fact", "facts")}
        </p>
        <h2 className="font-serif text-xl font-bold text-hive-navy">{root?.label ?? "Case"}</h2>
        {root?.summary ? (
          <p className="mt-1 font-sans text-sm text-hive-text-muted">{root.summary}</p>
        ) : null}
      </article>

      {cards.length ? <OverviewConnector columns={columns} gridStyle={gridStyle} /> : null}

      <section aria-label="Case areas" className="relative z-20 mt-4 w-full lg:mt-0">
        <div
          className="case-map-zone-grid grid items-stretch gap-4 lg:gap-3.5"
          style={gridStyle}
        >
          {cards.map((node) => (
            <OverviewCard
              key={node.id}
              map={map}
              index={index}
              node={node}
              onOpenZone={onOpenZone}
              onOpenGhost={onOpenGhost}
              onRevealAttention={onRevealAttention}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function OverviewConnector({
  columns,
  gridStyle,
}: {
  columns: number;
  gridStyle: CSSProperties;
}) {
  const inset = `${50 / columns}%`;
  return (
    <div aria-hidden className="relative hidden h-16 w-full lg:block" style={gridStyle}>
      <div className="absolute left-1/2 top-0 h-7 w-px -translate-x-1/2 border-l border-dashed border-[#c1c8c2]" />
      <div
        className="absolute top-7 h-px bg-[#c1c8c2]"
        style={{ left: inset, right: inset }}
      />
      <div
        className="absolute inset-x-0 bottom-0 top-7 grid"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: columns }, (_, index) => (
          <div key={index} className="relative">
            <div className="absolute left-1/2 top-0 h-[calc(100%-2px)] w-px -translate-x-1/2 bg-[#c1c8c2]" />
            <span className="absolute bottom-0 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[#c1c8c2]" />
          </div>
        ))}
      </div>
    </div>
  );
}

function OverviewCard({
  map,
  index,
  node,
  onOpenZone,
  onOpenGhost,
  onRevealAttention,
}: {
  map: CaseMap;
  index: CaseMapIndex;
  node: CaseMapNode;
  onOpenZone: (zoneId: string) => void;
  onOpenGhost: (node: CaseMapNode) => void;
  onRevealAttention: (nodeId: string) => void;
}) {
  const quiet = isQuietCard(node);
  const attention = attentionsInSubtree(map, node.id, index);
  const findings = node.kind === "zone" ? findingCount(node.id, index) : null;
  const attentive = attention.length > 0;

  return (
    <article
      className={[
        "group flex min-h-36 flex-col justify-between rounded-xl p-4 shadow-hive transition-all motion-safe:hover:-translate-y-1 motion-safe:hover:shadow-hive-md motion-reduce:transform-none",
        attentive
          ? "border-2 border-[#B8922E]/50 bg-hive-surface ring-4 ring-[#B8922E]/10"
          : quiet
            ? "border border-hive-border/80 bg-hive-surface/70"
            : "border border-hive-border bg-hive-surface",
      ].join(" ")}
    >
      <button
        type="button"
        data-testid={`case-map-node-${node.kind}`}
        data-node-id={node.id}
        className="flex flex-1 flex-col justify-between text-left"
        onClick={() => {
          if (node.kind === "ghost") {
            onOpenGhost(node);
            return;
          }
          onOpenZone(node.id);
        }}
      >
        <span className="flex items-start justify-between gap-2">
          <span
            className={[
              "font-sans text-base font-bold leading-snug break-words",
              node.kind === "ghost" ? "line-clamp-2" : "",
              quiet ? "text-hive-text-muted group-hover:text-hive-navy" : "text-hive-navy group-hover:text-hive-sage",
            ].join(" ")}
          >
            {node.label}
          </span>
          {attentive ? (
            <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#B8922E]" aria-hidden />
          ) : node.kind === "ghost" ? null : (
            <ArrowUpRight className="h-4 w-4 shrink-0 text-hive-text-muted" aria-hidden />
          )}
        </span>
        {findings != null ? (
          <span className="mt-3 inline-flex w-fit items-center gap-1 rounded bg-hive-page px-2 py-0.5 font-mono text-xs text-hive-text-muted">
            {countLabel(findings, "finding", "findings")}
          </span>
        ) : null}
      </button>
      <span className="mt-2 flex items-center justify-between">
        {attentive ? (
          <button
            type="button"
            data-testid="case-map-attention"
            className="inline-flex items-center gap-1 rounded bg-[#B8922E]/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#B8922E] hover:bg-[#B8922E] hover:text-white"
            onClick={() => onRevealAttention(node.id)}
          >
            <AlertTriangle className="h-3 w-3" aria-hidden />
            {countLabel(attention.length, "needs attention", "need attention")}
          </button>
        ) : (
          <span />
        )}
        <ChevronRight className="h-4 w-4 text-hive-border-strong" aria-hidden />
      </span>
    </article>
  );
}
