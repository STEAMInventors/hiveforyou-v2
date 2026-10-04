"use client";

import { useMemo } from "react";

import {
  buildCompactMapItems,
  type CompactMapItem,
} from "@/lib/questions/map-states";
import type { MapNodeResolutionState } from "@/lib/questions/types";
import type { DocumentDiscoveryResult } from "@/lib/document-discovery/types";

type CompactDocumentStructureMapProps = {
  discovery: DocumentDiscoveryResult;
  missingNodeStates: Record<string, MapNodeResolutionState>;
  ambiguityNodeStates: Record<string, MapNodeResolutionState>;
  highlightNodeIds?: string[];
};

function stateLabel(state: MapNodeResolutionState): string {
  switch (state) {
    case "EXPECTED":
      return "Expected";
    case "PROVIDED":
      return "Added";
    case "UNAVAILABLE":
      return "Unavailable";
    case "NOT_APPLICABLE":
      return "Not applicable";
    case "AMBIGUOUS":
      return "Needs confirmation";
    case "RESOLVED":
      return "In place";
    default:
      return "";
  }
}

function stateDotClass(state: MapNodeResolutionState): string {
  switch (state) {
    case "EXPECTED":
      return "bg-amber-500";
    case "PROVIDED":
      return "bg-hive-sage";
    case "UNAVAILABLE":
      return "bg-amber-600/80";
    case "NOT_APPLICABLE":
      return "bg-hive-text-muted";
    case "AMBIGUOUS":
      return "bg-hive-blue";
    case "RESOLVED":
      return "bg-hive-sage";
    default:
      return "bg-hive-border";
  }
}

function CompactMapNode({ item }: { item: CompactMapItem }) {
  const isMissing = item.kind === "missing";
  const quiet =
    item.state === "RESOLVED" ||
    item.state === "NOT_APPLICABLE" ||
    item.state === "UNAVAILABLE";

  return (
    <div
      data-testid={`compact-map-node-${item.id}`}
      data-map-state={item.state}
      className={[
        "flex shrink-0 items-center gap-2 rounded-hive-lg px-3 py-2 shadow-hive transition-colors",
        item.highlighted ? "ring-2 ring-hive-sage/50 ring-offset-1" : "",
        isMissing && item.state === "EXPECTED"
          ? "border border-dashed border-amber-400/60 bg-amber-50/50"
          : "border border-hive-border bg-hive-surface",
        quiet && isMissing ? "opacity-80" : "",
        item.state === "NOT_APPLICABLE" ? "opacity-60" : "",
      ].join(" ")}
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${stateDotClass(item.state)}`}
        aria-hidden
      />
      <div className="flex min-w-0 flex-col">
        <span className="max-w-[10rem] truncate font-mono text-xs font-medium text-hive-navy sm:max-w-[12rem]">
          {item.label}
        </span>
        {item.sublabel && (
          <span className="font-mono text-[10px] text-hive-text-muted">
            {item.sublabel}
          </span>
        )}
      </div>
      <span className="hidden font-sans text-[10px] font-medium text-hive-text-muted sm:inline">
        {stateLabel(item.state)}
      </span>
    </div>
  );
}

export function CompactDocumentStructureMap({
  discovery,
  missingNodeStates,
  ambiguityNodeStates,
  highlightNodeIds = [],
}: CompactDocumentStructureMapProps) {
  const highlightSet = useMemo(
    () => new Set(highlightNodeIds),
    [highlightNodeIds],
  );

  const items = useMemo(
    () =>
      buildCompactMapItems(
        discovery,
        missingNodeStates,
        ambiguityNodeStates,
        highlightSet,
      ),
    [discovery, missingNodeStates, ambiguityNodeStates, highlightSet],
  );

  return (
    <section
      aria-label="Document structure overview"
      data-testid="compact-document-structure-map"
      className="rounded-hive-xl bg-hive-page/80 p-4"
    >
      <div className="mb-3 flex items-center justify-between gap-2 text-xs">
        <span className="font-sans font-semibold text-hive-navy">
          Your document structure
        </span>
        <span className="font-sans text-hive-text-muted">
          {discovery.documents.length} recognized
          {discovery.missingDocuments.length > 0 &&
            ` · ${discovery.missingDocuments.length} expected`}
        </span>
      </div>
      <div className="flex items-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item, index) => (
          <div key={item.id} className="flex shrink-0 items-center gap-2">
            {index > 0 && (
              <span
                className="h-px w-3 shrink-0 bg-hive-border"
                aria-hidden
              />
            )}
            <CompactMapNode item={item} />
          </div>
        ))}
      </div>
    </section>
  );
}
