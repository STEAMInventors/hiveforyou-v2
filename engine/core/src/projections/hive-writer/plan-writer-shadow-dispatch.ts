import type { CanonicalStudyReportPresentationMode } from "@hiveforyou/shared/canonical-study-report-projection";
import type { HiveWriterShadowStatus } from "@hiveforyou/shared/hive-writer-proposal";

export function isHiveWriterShadowTerminalStatus(status: HiveWriterShadowStatus): boolean {
  return status === "accepted" || status === "rejected" || status === "failed";
}

export function isHiveWriterShadowInFlightStatus(status: HiveWriterShadowStatus): boolean {
  return status === "queued" || status === "processing";
}

/** Preview/Vercel path: internal preview only; each Generate creates a new run. */
export function shouldBlockWriterShadowPublication(
  presentationMode: CanonicalStudyReportPresentationMode,
): boolean {
  return presentationMode !== "internal_preview";
}

/** Worker: skip model invocation when this run is already finished or in progress. */
export function shouldReuseWriterRunRecord(existingStatus: HiveWriterShadowStatus | null): boolean {
  if (!existingStatus) {
    return false;
  }
  return isHiveWriterShadowTerminalStatus(existingStatus) || existingStatus === "processing";
}

/** Worker: invoke Writer only while the run is still queued. */
export function shouldInvokeWriterRun(existingStatus: HiveWriterShadowStatus | null): boolean {
  return existingStatus === "queued";
}
