"use client";

import { FileText } from "lucide-react";

import { AddMoreDocumentsControl } from "@/components/AddMoreDocumentsControl";
import type { StagedDocument } from "@/lib/staged-documents";
import { formatFileSize, getFileExtensionLabel } from "@/lib/format-file-metadata";

type StagedDocumentsCompactListProps = {
  documents: StagedDocument[];
  onRemove: (id: string) => void;
  onFilesAdded: (files: File[]) => void;
  dimmed?: boolean;
};

export function StagedDocumentsCompactList({
  documents,
  onRemove,
  onFilesAdded,
  dimmed = false,
}: StagedDocumentsCompactListProps) {
  return (
    <div
      className={[
        "flex w-full flex-col transition-opacity duration-200",
        dimmed ? "pointer-events-none opacity-55" : "",
      ].join(" ")}
      data-testid="staged-documents-compact-list"
    >
      <ul
        className="max-h-[min(42vh,320px)] w-full overflow-y-auto rounded-hive-xl border border-hive-border/80 bg-hive-surface/90 shadow-hive-sm"
        role="list"
        aria-label="Selected documents"
      >
        {documents.map((doc) => (
          <li
            key={doc.id}
            role="listitem"
            className="flex items-center gap-2 border-b border-hive-border/60 px-3 py-2 last:border-b-0 sm:px-3.5 sm:py-2.5"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-hive-md bg-hive-soft-sky/80 text-hive-blue">
              <FileText className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p
                className="truncate font-sans text-xs font-medium text-hive-navy sm:text-sm"
                title={doc.file.name}
              >
                {doc.file.name}
              </p>
              <p className="font-mono text-[10px] text-hive-text-muted sm:text-xs">
                {formatFileSize(doc.file.size)} · {getFileExtensionLabel(doc.file.name)}
              </p>
            </div>
            {!dimmed ? (
              <button
                type="button"
                aria-label={`Remove ${doc.file.name}`}
                onClick={() => onRemove(doc.id)}
                className="shrink-0 rounded-hive-md px-2 py-1 font-sans text-[10px] font-medium text-hive-text-muted transition-colors hover:bg-hive-error/5 hover:text-hive-error sm:text-xs"
              >
                Remove
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {!dimmed ? (
        <div className="mt-3 flex justify-center">
          <AddMoreDocumentsControl onFilesAdded={onFilesAdded} />
        </div>
      ) : null}
    </div>
  );
}
