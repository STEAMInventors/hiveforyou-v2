"use client";

import { CaseSummaryExperience } from "@/components/case-summary/CaseSummaryExperience";

export function StudyCaseMapClient({ studyRunId }: { studyRunId: string }) {
  return <CaseSummaryExperience studyRunId={studyRunId} />;
}
