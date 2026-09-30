"use client";

import { FileImage, FileText, FileType, X } from "lucide-react";

import {
  formatFileSize,
  getFileExtensionLabel,
  getFileIconKind,
} from "@/lib/format-file-metadata";

type DocumentRowProps = {
  filename: string;
  sizeBytes: number;
  onRemove: () => void;
};

function FileTypeIcon({ filename }: { filename: string }) {
  const kind = getFileIconKind(filename);
  const className = "h-5 w-5";
  if (kind === "pdf") {
    return <FileText className={className} strokeWidth={2} aria-hidden />;
  }
  if (kind === "image") {
    return <FileImage className={className} strokeWidth={2} aria-hidden />;
  }
  return <FileType className={className} strokeWidth={2} aria-hidden />;
}

function iconBackgroundClass(filename: string): string {
  return getFileIconKind(filename) === "image"
    ? "bg-[#EFF6FF]"
    : "bg-hive-soft-sky/80";
}

export function DocumentRow({
  filename,
  sizeBytes,
  onRemove,
}: DocumentRowProps) {
  const extLabel = getFileExtensionLabel(filename);

  return (
    <div className="group flex items-center justify-between gap-4 rounded-hive-xl bg-hive-surface p-3.5 shadow-hive transition-all hover:-translate-y-0.5 hover:shadow-hive-md sm:p-4">
      <div className="flex min-w-0 items-center gap-3.5">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-hive-lg text-hive-blue ${iconBackgroundClass(filename)}`}
        >
          <FileTypeIcon filename={filename} />
        </div>
        <div className="flex min-w-0 flex-col">
          <span
            className="truncate font-sans text-sm font-medium text-hive-navy sm:text-base"
            title={filename}
          >
            {filename}
          </span>
          <span className="font-mono text-xs text-hive-text-muted sm:text-sm">
            {formatFileSize(sizeBytes)} · {extLabel}
          </span>
        </div>
      </div>
      <button
        type="button"
        aria-label={`Remove ${filename}`}
        onClick={onRemove}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-hive-lg text-hive-text-muted transition-colors hover:bg-hive-error/5 hover:text-hive-error focus-visible:ring-2 focus-visible:ring-hive-blue-muted"
      >
        <X className="h-5 w-5" strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}
