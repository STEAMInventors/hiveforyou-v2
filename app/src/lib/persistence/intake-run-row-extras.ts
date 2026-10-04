import type { IntakeRunRecord } from "@hiveforyou/intake";

import { isInngestIntakePipeline } from "@/lib/intake/pipeline";

/** Omit `intake_queue_seq` on inline runs so DBs without the Phase 2a migration still work. */
export function intakeRunQueueSeqColumn(
  record: IntakeRunRecord,
): { intake_queue_seq?: number } {
  if (!isInngestIntakePipeline()) {
    return {};
  }
  return { intake_queue_seq: record.intakeQueueSeq };
}
