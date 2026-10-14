import { notFound } from "next/navigation";

import { isHiveDebugRoutesEnabled } from "@/lib/preview/preview-gate";
import { HiveFooter } from "@/components/HiveFooter";
import { HiveHeader } from "@/components/HiveHeader";
import { RawExtractionInspector } from "@/components/extraction-debug/RawExtractionInspector";

type PageProps = {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<{ studyRunId?: string }>;
};

export default async function ExtractionDebugPage({ params, searchParams }: PageProps) {
  if (!isHiveDebugRoutesEnabled()) {
    notFound();
  }

  const { caseId } = await params;
  const query = await searchParams;
  const initialStudyRunId = query.studyRunId?.trim();

  return (
    <>
      <HiveHeader />
      <main className="mx-auto min-h-0 w-full max-w-hive flex-1 px-6 py-8 sm:py-10">
        <div className="mb-8 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--hfy-quiet)]">
            Internal · ARCH-04
          </p>
          <h1 className="text-2xl font-semibold text-[var(--hfy-text)]">Raw Extraction Inspector</h1>
          <p className="text-sm text-[var(--hfy-graphite)]">
            Case <span className="font-mono">{caseId}</span>
          </p>
        </div>
        <RawExtractionInspector caseId={caseId} initialStudyRunId={initialStudyRunId} />
      </main>
      <HiveFooter />
    </>
  );
}
