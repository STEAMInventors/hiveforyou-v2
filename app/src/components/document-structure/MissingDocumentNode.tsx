import { CircleDashed } from "lucide-react";

import type { MissingExpectedDocument } from "@/lib/document-discovery/types";

type MissingDocumentNodeProps = {
  missing: MissingExpectedDocument;
  selected?: boolean;
  dimmed?: boolean;
  onSelect: () => void;
};

export function MissingDocumentNode({
  missing,
  selected = false,
  dimmed = false,
  onSelect,
}: MissingDocumentNodeProps) {
  return (
    <button
      type="button"
      data-testid={`missing-document-node-${missing.id}`}
      onClick={onSelect}
      aria-pressed={selected}
      className={[
        "flex w-full items-start gap-3 rounded-hive-lg border border-dashed border-amber-400/60 bg-amber-50/40 p-3 text-left",
        selected ? "ring-2 ring-amber-500/40 ring-offset-2 ring-offset-hive-page" : "",
        dimmed ? "opacity-40" : "opacity-100",
      ].join(" ")}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-hive-lg bg-amber-100/80 text-amber-700">
        <CircleDashed className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-sans text-sm font-semibold text-hive-navy">
          {missing.expectedDocumentType}
        </span>
        <span className="mt-0.5 block font-sans text-xs text-hive-text-muted">
          Expected · not provided
        </span>
        <span className="mt-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 font-sans text-[10px] font-medium text-amber-800">
          Missing from collection
        </span>
      </span>
    </button>
  );
}
