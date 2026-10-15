import "server-only";

import { projectCanonicalStudyReport } from "@hiveforyou/core";
import type { CanonicalStudyReportAudience } from "@hiveforyou/shared/canonical-study-report-projection";

import {
  loadDeterministicCanonicalStudyArtifactForSession,
} from "@/lib/canonical-debug/run-deterministic-canonical-study-server";
import type { CanonicalStudyDebugArtifactMetadata } from "@hiveforyou/core";

export async function loadCanonicalStudyReportProjectionForSession(input: {
  caseId: string;
  studyRunId: string;
  audience: CanonicalStudyReportAudience;
}) {
  const artifact = await loadDeterministicCanonicalStudyArtifactForSession({
    caseId: input.caseId,
    studyRunId: input.studyRunId,
  });

  const metadata = artifact as typeof artifact & CanonicalStudyDebugArtifactMetadata;
  return projectCanonicalStudyReport({
    artifact,
    audience: input.audience,
    customerProReportsPermitted: metadata.customerProReportsPermitted,
    packApprovalLabel: metadata.packApprovalLabel,
  });
}
