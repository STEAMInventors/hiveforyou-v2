"use client";

type CanonicalStudyBuildConfirmModalProps = {
  open: boolean;
  mode: "create" | "update";
  documentCount: number;
  showFailedDocumentNotice: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function CanonicalStudyBuildConfirmModal({
  open,
  mode,
  documentCount,
  showFailedDocumentNotice,
  busy,
  onCancel,
  onConfirm,
}: CanonicalStudyBuildConfirmModalProps) {
  if (!open) {
    return null;
  }

  const docLabel = `${documentCount} document${documentCount === 1 ? "" : "s"}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center px-4 py-6 sm:items-center sm:py-8"
      data-testid="canonical-study-build-modal"
    >
      <button
        type="button"
        className="absolute inset-0 bg-[#1F2328]/40 backdrop-blur-[1px]"
        aria-label="Close dialog"
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="canonical-study-build-title"
        className="relative z-10 w-full max-w-lg rounded-[18px] border border-customerHive-border bg-white p-6 shadow-lg sm:p-7"
      >
        <h2
          id="canonical-study-build-title"
          className="text-2xl font-semibold tracking-[-0.015em] text-customerHive-on-surface"
          style={{ fontFamily: "var(--font-outfit), sans-serif" }}
        >
          {mode === "update" ? "Update your study?" : "Build your study?"}
        </h2>
        <p className="mt-3 text-[15.5px] leading-relaxed text-customerHive-on-surface-variant">
          {mode === "update"
            ? `Your documents have changed, so we'll build a new study from all ${docLabel}. Your current study and reports stay available, and nothing is replaced until the new study is ready.`
            : `We'll read across your ${docLabel} and connect what they say. There's no study in this Hive yet, so we'll create a new one. It usually takes a few minutes, and you can leave while we work.`}
        </p>
        {showFailedDocumentNotice ? (
          <p className="mt-4 rounded-[10px] bg-[#FEF5E1] px-3.5 py-3 text-sm font-medium leading-snug text-[#6B4600]">
            One or more documents could not be read and will be left out. You can retry them from
            Documents first.
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-end gap-2.5">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="h-11 rounded-[10px] border border-customerHive-border bg-white px-[18px] text-[15px] font-semibold text-customerHive-on-surface hover:bg-[#F4F6F8] disabled:opacity-60"
          >
            Not now
          </button>
          <button
            type="button"
            data-testid="canonical-study-build-confirm"
            disabled={busy}
            onClick={onConfirm}
            className="h-11 rounded-[10px] bg-customerHive-secondary px-5 text-[15px] font-semibold text-white hover:bg-[#2456B8] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Starting…" : "Build study"}
          </button>
        </div>
      </div>
    </div>
  );
}
