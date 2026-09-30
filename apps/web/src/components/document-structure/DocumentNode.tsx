import { FileText } from "lucide-react";

import { formatFileSize } from "@/lib/format-file-metadata";
import type { DocumentDiscoveryDocument } from "@/lib/document-discovery/types";

type DocumentNodeProps = {
  document: DocumentDiscoveryDocument;
  selected?: boolean;
  dimmed?: boolean;
  onSelect: () => void;
};

export function DocumentNode({
  document,
  selected = false,
  dimmed = false,
  onSelect,
}: DocumentNodeProps) {
  const statusLabel =
    document.recognitionStatus === "recognized"
      ? "Recognized"
      : document.recognitionStatus === "ambiguous"
        ? "Needs clarification"
        : document.recognitionStatus === "proposed_type"
          ? "Not a standard type"
          : "Unrecognized";

  return (
    <button
      type="button"
      data-testid={`document-node-${document.id}`}
      onClick={onSelect}
      aria-pressed={selected}
      className={[
        "group flex w-full items-start gap-3 rounded-hive-lg border p-3 text-left transition-colors",
        selected
          ? "border-hive-sage bg-hive-soft-sky/60 shadow-hive-md"
          : "border-hive-border bg-hive-surface hover:border-hive-blue/40 hover:bg-hive-soft-sky/30",
        dimmed ? "opacity-40" : "opacity-100",
      ].join(" ")}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-hive-lg bg-hive-upload-icon-bg text-hive-sage">
        <FileText className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-sans text-sm font-semibold text-hive-navy">
          {document.title}
        </span>
        <span className="mt-0.5 block font-sans text-xs text-hive-text-muted">
          {document.documentType}
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-hive-blue">
          {document.documentDate && <span>{document.documentDate}</span>}
          <span>{formatFileSize(document.sizeBytes)}</span>
          <span className="rounded-full bg-hive-soft-sky px-2 py-0.5 font-sans text-[10px] font-medium text-hive-blue">
            {statusLabel}
          </span>
        </span>
      </span>
    </button>
  );
}
