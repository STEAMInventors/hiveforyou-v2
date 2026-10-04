import { HelpCircle } from "lucide-react";

import type { DocumentDiscoveryDocument } from "@/lib/document-discovery/types";

type AmbiguousDocumentNodeProps = {
  document: DocumentDiscoveryDocument;
  selected?: boolean;
  dimmed?: boolean;
  onSelect: () => void;
};

export function AmbiguousDocumentNode(props: AmbiguousDocumentNodeProps) {
  const { document, selected, dimmed, onSelect } = props;

  return (
    <button
      type="button"
      data-testid={`ambiguous-document-node-${document.id}`}
      onClick={onSelect}
      aria-pressed={selected}
      className={[
        "flex w-full items-start gap-3 rounded-hive-lg border border-dashed border-hive-blue/50 bg-hive-surface p-3 text-left",
        selected ? "ring-2 ring-hive-blue-muted ring-offset-2 ring-offset-hive-page" : "",
        dimmed ? "opacity-40" : "opacity-100",
      ].join(" ")}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-hive-lg bg-hive-soft-sky text-hive-blue">
        <HelpCircle className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-sans text-sm font-semibold text-hive-navy">
          {document.originalFilename}
        </span>
        <span className="mt-0.5 block font-sans text-xs text-hive-text-muted">
          Document type not yet confirmed
        </span>
        <span className="mt-2 inline-flex rounded-full bg-hive-soft-sky px-2 py-0.5 font-sans text-[10px] font-medium text-hive-blue">
          Ambiguous identity
        </span>
      </span>
    </button>
  );
}
