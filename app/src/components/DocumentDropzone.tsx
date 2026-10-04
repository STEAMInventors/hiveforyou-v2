"use client";

import { FolderPlus } from "lucide-react";
import {
  useCallback,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";

import { UploadZoneDocumentCluster } from "@/components/DocumentVisual";
import {
  ACCEPTED_FORMATS_LABEL,
  ACCEPTED_UPLOAD_MIME,
} from "@/lib/upload-constants";

export type DocumentDropzoneProps = {
  /** Called when the user selects files. V2-001A keeps selection client-side only. */
  onFilesSelected?: (files: File[]) => void;
};

export function DocumentDropzone({ onFilesSelected }: DocumentDropzoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const applyFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList?.length) {
        return;
      }
      const files = Array.from(fileList);
      onFilesSelected?.(files);
      const count = files.length;
      setStatusMessage(
        count === 1 ? "1 file selected." : `${count} files selected.`,
      );
    },
    [onFilesSelected],
  );

  const openPicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    applyFiles(event.target.files);
    event.target.value = "";
  };

  const onDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(true);
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(true);
  };

  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.contains(event.relatedTarget as Node)) {
      return;
    }
    setIsDragOver(false);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
    applyFiles(event.dataTransfer.files);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPicker();
    }
  };

  return (
    <div className="relative z-10 w-full">
      <div
        data-testid="document-dropzone"
        tabIndex={0}
        aria-label="Upload documents. Choose documents or drag and drop files here."
        aria-describedby={`${inputId}-hint ${inputId}-formats`}
        aria-dropeffect={isDragOver ? "copy" : undefined}
        onKeyDown={onKeyDown}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        data-drag-over={isDragOver ? "true" : "false"}
        className="group relative flex w-full flex-col items-center justify-center rounded-hive-2xl border-2 border-dashed border-hive-border bg-hive-surface p-8 text-center shadow-hive transition-all duration-200 hover:border-hive-sage hover:shadow-hive-md data-[drag-over=true]:border-hive-sage data-[drag-over=true]:shadow-hive-md sm:p-12 md:p-16"
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          multiple
          accept={ACCEPTED_UPLOAD_MIME}
          className="sr-only"
          onChange={onInputChange}
          tabIndex={-1}
        />

        <UploadZoneDocumentCluster />

        <div className="mx-auto max-w-md space-y-4">
          <div>
            <label
              htmlFor={inputId}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-hive-sage px-8 py-4 font-sans text-base font-bold text-hive-text-inverse shadow-hive-md transition-all hover:-translate-y-0.5 hover:shadow-hive-lg focus-within:ring-2 focus-within:ring-hive-sage focus-within:ring-offset-2 active:translate-y-0 md:text-lg"
            >
              <FolderPlus className="h-5 w-5" strokeWidth={2} aria-hidden />
              <span>Choose documents</span>
            </label>
          </div>

          <p
            id={`${inputId}-hint`}
            className="font-sans text-sm font-normal text-hive-text-muted sm:text-base"
          >
            or drag and drop files here
          </p>

          <p
            id={`${inputId}-formats`}
            className="pt-1 font-sans text-xs tracking-wide text-hive-text-muted/80"
          >
            {ACCEPTED_FORMATS_LABEL}
          </p>
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {statusMessage}
      </p>
    </div>
  );
}
