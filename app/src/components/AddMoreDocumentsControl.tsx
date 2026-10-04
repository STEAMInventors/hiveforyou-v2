"use client";

import { CirclePlus } from "lucide-react";
import { useId, type ChangeEvent } from "react";

import {
  ADD_MORE_FORMATS_HINT,
  ACCEPTED_UPLOAD_MIME,
} from "@/lib/upload-constants";

type AddMoreDocumentsControlProps = {
  onFilesAdded: (files: File[]) => void;
};

export function AddMoreDocumentsControl({
  onFilesAdded,
}: AddMoreDocumentsControlProps) {
  const inputId = useId();

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (fileList?.length) {
      onFilesAdded(Array.from(fileList));
    }
    event.target.value = "";
  };

  return (
    <label
      htmlFor={inputId}
      className="flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-hive-xl bg-hive-surface/60 p-4 font-sans text-sm font-medium text-hive-navy transition-all hover:bg-hive-sage/10 hover:shadow-hive sm:text-base"
    >
      <CirclePlus className="h-5 w-5 text-hive-blue" strokeWidth={2} aria-hidden />
      <span>Add more documents</span>
      <span className="hidden font-mono text-xs text-hive-text-muted sm:inline">
        — {ADD_MORE_FORMATS_HINT}
      </span>
      <input
        id={inputId}
        type="file"
        multiple
        accept={ACCEPTED_UPLOAD_MIME}
        className="sr-only"
        onChange={onChange}
      />
    </label>
  );
}
