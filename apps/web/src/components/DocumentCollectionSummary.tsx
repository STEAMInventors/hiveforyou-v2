import { FolderOpen } from "lucide-react";

import { formatTotalSize } from "@/lib/format-file-metadata";
import { documentCountLabel } from "@/lib/staged-documents";

type DocumentCollectionSummaryProps = {
  count: number;
  totalBytes: number;
};

export function DocumentCollectionSummary({
  count,
  totalBytes,
}: DocumentCollectionSummaryProps) {
  return (
    <div
      className="mb-6 flex w-full flex-wrap items-center justify-between gap-4 rounded-hive-xl bg-hive-surface px-5 py-3.5 shadow-hive"
      aria-label={`${documentCountLabel(count)}, ${formatTotalSize(totalBytes)}`}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-hive-lg bg-hive-soft-sky text-hive-blue">
          <FolderOpen className="h-4 w-4" strokeWidth={2} aria-hidden />
        </div>
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-sans text-sm font-medium text-hive-navy sm:text-base">
            {documentCountLabel(count)}
          </span>
          <span className="text-hive-text-muted" aria-hidden>
            ·
          </span>
          <span className="font-mono text-xs font-medium text-hive-text-muted sm:text-sm">
            {formatTotalSize(totalBytes)}
          </span>
        </div>
      </div>
    </div>
  );
}
