"use client";

import { formatFileSize } from "@/lib/format-file-metadata";

type PreviewFile = {
  name: string;
  sizeBytes: number;
};

type LandingUploadDocumentsPreviewProps = {
  fileCount: number;
  files: PreviewFile[];
  rawIntent: string;
  explicitDomainId: string | null;
  explicitDomainLabel: string | null;
  hiveName: string;
  hiveDescription: string | null;
  previewHive?: boolean;
  onBack: () => void;
};

export function LandingUploadDocumentsPreview({
  fileCount,
  files,
  rawIntent,
  explicitDomainId,
  explicitDomainLabel,
  hiveName,
  hiveDescription,
  previewHive = true,
  onBack,
}: LandingUploadDocumentsPreviewProps) {
  const hiveTitle = previewHive ? `${hiveName} (Preview)` : hiveName;

  return (
    <section
      className="mx-auto flex w-full max-w-[560px] flex-col gap-5"
      data-testid="landing-upload-documents-preview"
      aria-label="Upload documents preview"
    >
      <div
        className="rounded-[10px] border border-[#EBDDB4] bg-[#FBF4E2] px-3.5 py-2.5 text-sm leading-snug text-[#3D3000]"
        data-testid="landing-upload-preview-mode-banner"
      >
        <span className="font-semibold">Preview Mode.</span> Nothing is saved or uploaded until you
        sign in and continue with a real Hive account. Reading and analysis stay disabled here.
      </div>

      <div className="flex flex-col gap-2 text-center">
        <h2 className="m-0 text-[1.5rem] font-semibold tracking-tight text-[#0D0D0D]">
          Your documents
        </h2>
        <p className="m-0 text-sm leading-relaxed text-[#5F6368]">
          {fileCount} file{fileCount === 1 ? "" : "s"} staged on this device for{" "}
          <span className="font-medium text-[#0D0D0D]" data-testid="landing-upload-preview-hive-name">
            {hiveTitle}
          </span>
          . They are not uploaded yet.
        </p>
      </div>

      <div
        className="flex flex-col gap-3 rounded-[16px] border border-[#E7E9ED] bg-white px-5 py-4 shadow-[0_1px_2px_rgba(31,35,40,0.04)]"
        data-testid="landing-upload-preview-intent"
      >
        <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#5F6368]">
          What you&apos;re working on
        </p>
        <p className="m-0 text-sm text-[#0D0D0D]">{rawIntent}</p>
        {hiveDescription ? (
          <p className="m-0 text-sm text-[#5F6368]" data-testid="landing-upload-preview-hive-description">
            {hiveDescription}
          </p>
        ) : null}
        {explicitDomainId ? (
          <p className="m-0 text-sm text-[#5F6368]">
            Domain:{" "}
            <span className="font-medium text-[#3C4043]">
              {explicitDomainLabel ?? explicitDomainId}
            </span>
          </p>
        ) : null}
      </div>

      <ul
        className="m-0 flex list-none flex-col gap-2 p-0"
        data-testid="landing-upload-preview-file-list"
      >
        {files.map((file) => (
          <li
            key={file.name}
            className="flex items-center justify-between gap-3 rounded-[14px] border border-[#E7E9ED] bg-[#F8F9FA] px-4 py-3"
            data-testid={`landing-upload-preview-file-${file.name}`}
          >
            <span className="min-w-0 truncate text-sm font-medium text-[#0D0D0D]">{file.name}</span>
            <span className="shrink-0 font-mono text-xs text-[#5F6368]">
              {formatFileSize(file.sizeBytes)}
            </span>
          </li>
        ))}
      </ul>

      <div
        className="rounded-[14px] border border-dashed border-[#DADCE0] bg-white px-4 py-3 text-sm text-[#5F6368]"
        data-testid="landing-upload-preview-readiness"
        role="status"
      >
        <span className="font-medium text-[#0D0D0D]">Ready when you sign in.</span> Your selection
        looks complete for upload, but Hive cannot read or store these files until authentication is
        connected.
      </div>

      <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-center">
        <button
          type="button"
          data-testid="landing-upload-preview-back"
          className="min-h-11 rounded-full border border-[#E3E3E3] bg-white px-5 text-sm font-medium text-[#3C4043]"
          onClick={onBack}
        >
          Back
        </button>
      </div>
    </section>
  );
}
