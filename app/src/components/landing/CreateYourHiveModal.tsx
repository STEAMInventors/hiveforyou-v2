"use client";

import { useEffect, useId, useRef } from "react";

import {
  HIVE_DESCRIPTION_MAX_LENGTH,
  HIVE_NAME_MAX_LENGTH,
  validateCreateHiveInput,
} from "@/components/landing/create-hive-validation";

export type CreateYourHiveModalProps = {
  open: boolean;
  domainId: string | null;
  domainLabel: string | null;
  hiveName: string;
  hiveDescription: string;
  nameError?: string | null;
  descriptionError?: string | null;
  submitBusy?: boolean;
  onHiveNameChange: (value: string) => void;
  onHiveDescriptionChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

export function CreateYourHiveModal({
  open,
  domainId,
  domainLabel,
  hiveName,
  hiveDescription,
  nameError = null,
  descriptionError = null,
  submitBusy = false,
  onHiveNameChange,
  onHiveDescriptionChange,
  onCancel,
  onSubmit,
}: CreateYourHiveModalProps) {
  const titleId = useId();
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      nameInputRef.current?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const domainDisplay = domainLabel ?? domainId ?? "Not selected yet";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center px-4 py-6 sm:items-center sm:py-8"
      data-testid="landing-create-hive-modal"
    >
      <button
        type="button"
        className="absolute inset-0 bg-[#1F2328]/40 backdrop-blur-[1px]"
        aria-label="Close dialog"
        onClick={onCancel}
        disabled={submitBusy}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-lg rounded-[18px] border border-[#E7E9ED] bg-white p-6 shadow-lg sm:p-7"
      >
        <div className="flex flex-col gap-1.5">
          <h2
            id={titleId}
            className="text-[1.875rem] font-semibold leading-tight tracking-[-0.02em] text-[#0D0D0D]"
            style={{ fontFamily: "var(--font-outfit), sans-serif" }}
          >
            Create a Hive
          </h2>
          <p className="m-0 text-[15px] leading-relaxed text-[#4A525C]">
            A private space for one situation. You can rename it later.
          </p>
        </div>

        <div className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-[#0D0D0D]">
            Hive name
            <input
              ref={nameInputRef}
              type="text"
              value={hiveName}
              maxLength={HIVE_NAME_MAX_LENGTH}
              placeholder="e.g. Maya's IEP 2025–26"
              data-testid="landing-create-hive-name"
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? "landing-create-hive-name-error" : undefined}
              className={
                nameError
                  ? "min-h-[46px] rounded-[10px] border border-[#B3261E] bg-white px-3.5 text-[15px] text-[#0D0D0D] outline-none ring-2 ring-[#FCECEA]"
                  : "min-h-[46px] rounded-[10px] border border-[#DADCE0] bg-white px-3.5 text-[15px] text-[#0D0D0D] outline-none focus:border-[#2F6FE4] focus:ring-2 focus:ring-[#EEF4FF]"
              }
              onChange={(event) => {
                onHiveNameChange(event.target.value);
              }}
            />
          </label>
          {nameError ? (
            <p
              id="landing-create-hive-name-error"
              className="-mt-2 text-sm text-[#B3261E]"
              role="alert"
              data-testid="landing-create-hive-name-error"
            >
              {nameError}
            </p>
          ) : null}

          <label className="flex flex-col gap-1.5 text-sm font-semibold text-[#0D0D0D]">
            Description{" "}
            <span className="font-normal text-[#5F6368]">(optional)</span>
            <textarea
              value={hiveDescription}
              maxLength={HIVE_DESCRIPTION_MAX_LENGTH}
              rows={3}
              placeholder="What this Hive is for — optional"
              data-testid="landing-create-hive-description"
              aria-invalid={descriptionError ? true : undefined}
              aria-describedby={
                descriptionError ? "landing-create-hive-description-error" : undefined
              }
              className={
                descriptionError
                  ? "resize-y rounded-[10px] border border-[#B3261E] bg-white px-3.5 py-2.5 text-[15px] leading-relaxed text-[#0D0D0D] outline-none ring-2 ring-[#FCECEA]"
                  : "resize-y rounded-[10px] border border-[#DADCE0] bg-white px-3.5 py-2.5 text-[15px] leading-relaxed text-[#0D0D0D] outline-none focus:border-[#2F6FE4] focus:ring-2 focus:ring-[#EEF4FF]"
              }
              onChange={(event) => {
                onHiveDescriptionChange(event.target.value);
              }}
            />
          </label>
          {descriptionError ? (
            <p
              id="landing-create-hive-description-error"
              className="-mt-2 text-sm text-[#B3261E]"
              role="alert"
              data-testid="landing-create-hive-description-error"
            >
              {descriptionError}
            </p>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-[#0D0D0D]">Domain</span>
            <p
              className="m-0 min-h-[46px] rounded-[10px] border border-[#E7E9ED] bg-[#F8F9FA] px-3.5 py-2.5 text-[15px] text-[#3C4043]"
              data-testid="landing-create-hive-domain"
            >
              {domainDisplay}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2.5">
          <button
            type="button"
            data-testid="landing-create-hive-cancel"
            disabled={submitBusy}
            className="h-11 rounded-[10px] border border-[#E7E9ED] bg-white px-[18px] text-[15px] font-semibold text-[#0D0D0D] hover:bg-[#F4F6F8] disabled:opacity-60"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="landing-create-hive-submit"
            disabled={submitBusy}
            className="h-11 rounded-[10px] border-0 bg-[#2F6FE4] px-5 text-[15px] font-semibold text-white hover:bg-[#2456B8] disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onSubmit}
          >
            {submitBusy ? "Creating…" : "Create Hive"}
          </button>
        </div>
      </div>
    </div>
  );
}
