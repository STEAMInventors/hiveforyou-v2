"use client";

import { FileUp, Trash2 } from "lucide-react";
import { useId, type ChangeEvent } from "react";

import { formatFileSize } from "@/lib/format-file-metadata";
import { ACCEPTED_UPLOAD_MIME } from "@/lib/upload-constants";
import type {
  MissingDocumentAnswerValue,
  QuestionDefinition,
} from "@/lib/questions/types";

import { QuestionCard } from "./QuestionCard";
import { QuestionReason } from "./QuestionReason";

type MissingDocumentQuestionProps = {
  question: QuestionDefinition;
  value: MissingDocumentAnswerValue | undefined;
  onSelectDisposition: (disposition: "unavailable" | "not_applicable") => void;
  onAddFile: (file: File) => void;
  onClearAttachment: () => void;
};

export function MissingDocumentQuestion({
  question,
  value,
  onSelectDisposition,
  onAddFile,
  onClearAttachment,
}: MissingDocumentQuestionProps) {
  const inputId = useId();
  const selected =
    value?.disposition === "add_document"
      ? "add_document"
      : value?.disposition === "unavailable"
        ? "unavailable"
        : value?.disposition === "not_applicable"
          ? "not_applicable"
          : null;

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onAddFile(file);
    }
    event.target.value = "";
  };

  const answered = Boolean(value);

  return (
    <QuestionCard
      questionId={question.id}
      kicker={question.kicker}
      prompt={question.prompt}
      reason={<QuestionReason reason={question.humanReason} />}
      answered={answered}
    >
      <div
        className="mb-4 grid grid-cols-1 gap-2 rounded-hive-xl bg-hive-page p-1.5 sm:grid-cols-3"
        role="group"
        aria-label="Missing document options"
      >
        {question.options?.map((option) => {
          const isActive = selected === option.id;
          return (
            <button
              key={option.id}
              type="button"
              data-testid={`missing-option-${option.id}`}
              aria-pressed={isActive}
              onClick={() => {
                if (option.id === "add_document") {
                  document.getElementById(inputId)?.click();
                  return;
                }
                if (option.id === "unavailable") {
                  onSelectDisposition("unavailable");
                }
                if (option.id === "not_applicable") {
                  onSelectDisposition("not_applicable");
                }
              }}
              className={[
                "flex items-center justify-center gap-2 rounded-hive-lg px-4 py-2.5 font-sans text-sm font-semibold transition-colors",
                isActive
                  ? "bg-hive-surface text-hive-navy shadow-hive"
                  : "text-hive-text-muted hover:text-hive-navy",
              ].join(" ")}
            >
              {option.id === "add_document" && (
                <FileUp className="h-4 w-4 text-hive-sage" aria-hidden />
              )}
              {option.label}
            </button>
          );
        })}
      </div>

      <input
        id={inputId}
        type="file"
        accept={ACCEPTED_UPLOAD_MIME}
        className="sr-only"
        onChange={onFileChange}
        data-testid="missing-document-upload-input"
      />

      {value?.disposition === "add_document" && (
        <div
          className="rounded-hive-xl bg-hive-soft-sky/30 p-4"
          data-testid="missing-document-attachment"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-mono text-sm font-semibold text-hive-navy">
                {value.filename}
              </p>
              <p className="mt-1 font-sans text-xs text-hive-text-muted">
                Attached to your collection · {formatFileSize(value.sizeBytes)} ·
                pending organization
              </p>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-1 self-end rounded-hive-md px-3 py-1.5 font-sans text-sm text-hive-text-muted hover:text-hive-error sm:self-auto"
              onClick={onClearAttachment}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              Remove
            </button>
          </div>
        </div>
      )}
    </QuestionCard>
  );
}
