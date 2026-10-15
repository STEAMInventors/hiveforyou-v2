import "server-only";

import {
  assertHiveUiTree,
  buildDeterministicHiveUiTree,
  projectCanonicalStudyReport,
} from "@hiveforyou/core";
import type { CanonicalStudyDebugArtifactMetadata } from "@hiveforyou/core";
import type { CanonicalStudyReportAudience } from "@hiveforyou/shared/canonical-study-report-projection";
import type { HiveUiTree } from "@hiveforyou/shared/hive-ui-tree";

import {
  loadDeterministicCanonicalStudyArtifactForSession,
} from "@/lib/canonical-debug/run-deterministic-canonical-study-server";

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
  const projection = projectCanonicalStudyReport({
    artifact,
    audience: input.audience,
    customerProReportsPermitted: metadata.customerProReportsPermitted,
    packApprovalLabel: metadata.packApprovalLabel,
  });

  let hiveUiTree: HiveUiTree | null = null;
  const candidate = buildDeterministicHiveUiTree(projection);
  if (candidate) {
    try {
      hiveUiTree = assertHiveUiTree(artifact, projection, candidate);
    } catch {
      hiveUiTree = null;
    }
  }

  return { ...projection, hiveUiTree };
}
