import type { CanonicalStudyReportPresentationMode } from "@hiveforyou/shared/canonical-study-report-projection";
import type { HiveWriterShadowStatus } from "@hiveforyou/shared/hive-writer-proposal";

export function isHiveWriterShadowTerminalStatus(status: HiveWriterShadowStatus): boolean {
  return status === "accepted" || status === "rejected" || status === "failed";
}

export function isHiveWriterShadowInFlightStatus(status: HiveWriterShadowStatus): boolean {
  return status === "queued" || status === "processing";
}

export type WriterShadowPreviewPlan =
  | { action: "skip_disabled" }
  | { action: "block_publication" }
  | { action: "return_existing"; resend: boolean }
  | { action: "enqueue" };

/**
 * Preview/Vercel decision. Production never enqueues. In-flight rows resend the same
 * Inngest id (deduped) without rewriting storage. Terminal rows are reused as-is.
 */
export function planWriterShadowPreviewRequest(input: {
  vercelEnv: string | undefined;
  presentationMode: CanonicalStudyReportPresentationMode;
  existingStatus: HiveWriterShadowStatus | null;
}): WriterShadowPreviewPlan {
  if (input.vercelEnv === "production") {
    return { action: "skip_disabled" };
  }
  if (input.presentationMode !== "internal_preview") {
    return { action: "block_publication" };
  }
  if (input.existingStatus && isHiveWriterShadowTerminalStatus(input.existingStatus)) {
    return { action: "return_existing", resend: false };
  }
  if (input.existingStatus && isHiveWriterShadowInFlightStatus(input.existingStatus)) {
    return { action: "return_existing", resend: true };
  }
  return { action: "enqueue" };
}

export type WriterShadowWorkerPlan = "block_publication" | "reuse" | "invoke";

/** Worker decision: internal preview only; publication mode is enforced from persisted artifact metadata. */
export function planWriterShadowWorkerExecution(input: {
  presentationMode: CanonicalStudyReportPresentationMode;
  existingStatus: HiveWriterShadowStatus | null;
}): WriterShadowWorkerPlan {
  if (input.presentationMode !== "internal_preview") {
    return "block_publication";
  }
  if (input.existingStatus && isHiveWriterShadowTerminalStatus(input.existingStatus)) {
    return "reuse";
  }
  return "invoke";
}
