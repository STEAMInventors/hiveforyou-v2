import { File, FileText, Upload } from "lucide-react";

export function DocumentVisualAmbientLeft() {
  return (
    <div
      className="pointer-events-none absolute -left-16 top-12 z-0 hidden h-44 w-32 rounded-xl border border-hive-border bg-hive-surface p-3 opacity-75 shadow-hive motion-safe:animate-doc-float lg:block"
      style={{ "--doc-rotate": "-7deg" } as React.CSSProperties}
      aria-hidden
    >
      <div className="mb-2 h-2 w-8 rounded bg-hive-border" />
      <div className="mb-1.5 h-1.5 w-full rounded bg-hive-border/60" />
      <div className="mb-1.5 h-1.5 w-4/5 rounded bg-hive-border/60" />
      <div className="mb-4 h-1.5 w-3/4 rounded bg-hive-border/60" />
      <div className="flex h-16 w-full items-center justify-center rounded-lg border border-hive-border/50 bg-hive-page">
        <File className="h-5 w-5 text-hive-blue/40" strokeWidth={2} aria-hidden />
      </div>
    </div>
  );
}

export function DocumentVisualAmbientRight() {
  return (
    <div
      className="pointer-events-none absolute -right-14 top-20 z-0 hidden h-44 w-32 rounded-xl border border-hive-border bg-hive-surface p-3 opacity-75 shadow-hive motion-safe:animate-doc-float-delay-1 lg:block"
      style={{ "--doc-rotate": "6deg" } as React.CSSProperties}
      aria-hidden
    >
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-4 w-4 items-center justify-center rounded bg-hive-soft-sky/80">
          <FileText className="h-2.5 w-2.5 text-hive-blue" strokeWidth={2} aria-hidden />
        </div>
        <div className="h-2 w-12 rounded bg-hive-border" />
      </div>
      <div className="mb-1.5 h-1.5 w-full rounded bg-hive-border/60" />
      <div className="mb-1.5 h-1.5 w-5/6 rounded bg-hive-border/60" />
      <div className="mb-3 h-1.5 w-2/3 rounded bg-hive-border/60" />
      <div className="mb-1.5 h-1.5 w-full rounded bg-hive-border/40" />
      <div className="h-1.5 w-4/5 rounded bg-hive-border/40" />
    </div>
  );
}

export function UploadZoneDocumentCluster() {
  return (
    <div
      className="relative mb-8 flex h-20 w-28 items-center justify-center"
      aria-hidden
    >
      <div className="absolute -left-2 top-1 flex h-[4.5rem] w-14 -rotate-8 flex-col rounded-lg border border-hive-border bg-hive-page p-1.5 shadow-sm transition-transform duration-300 group-hover:-translate-x-1 group-hover:-rotate-12">
        <div className="mb-1 h-1 w-4 rounded bg-hive-border" />
        <div className="mb-0.5 h-0.5 w-full rounded bg-hive-border/60" />
        <div className="h-0.5 w-3/4 rounded bg-hive-border/60" />
      </div>
      <div className="absolute -right-2 top-1 flex h-[4.5rem] w-14 rotate-8 flex-col rounded-lg border border-hive-border bg-hive-page p-1.5 shadow-sm transition-transform duration-300 group-hover:translate-x-1 group-hover:rotate-12">
        <div className="mb-1 h-1 w-5 rounded bg-hive-border" />
        <div className="mb-0.5 h-0.5 w-full rounded bg-hive-border/60" />
        <div className="h-0.5 w-4/5 rounded bg-hive-border/60" />
      </div>
      <div className="relative z-10 flex h-20 w-16 flex-col items-center justify-center rounded-xl border border-hive-border bg-hive-surface shadow-hive transition-colors group-hover:border-hive-sage">
        <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-hive-upload-icon-bg transition-transform group-hover:scale-105">
          <Upload className="h-5 w-5 text-hive-sage" strokeWidth={2} aria-hidden />
        </div>
        <div className="h-1 w-8 rounded bg-hive-border/80" />
      </div>
    </div>
  );
}
