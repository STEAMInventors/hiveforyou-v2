import {
  isTerminalIntakeDocumentStatus,
  type IntakeDocumentStatus,
  type IntakeRunStatus,
} from "@hiveforyou/shared/intake";

/**
 * A usable Intake result is any completed document that is not FAILED
 * (classified, needs review, or needs OCR). One failed document does not
 * fail the collection when another document completed.
 * Run FAILED is only an empty collection or every document FAILED.
 */
export function rollupIntakeRunStatus(statuses: IntakeDocumentStatus[]): IntakeRunStatus {
  if (statuses.length === 0) {
    return "FAILED";
  }
  if (statuses.some((status) => !isTerminalIntakeDocumentStatus(status))) {
    return "RUNNING";
  }
  if (statuses.every((status) => status === "FAILED")) {
    return "FAILED";
  }
  if (statuses.every((status) => status === "CLASSIFIED")) {
    return "SUCCEEDED";
  }
  return "NEEDS_REVIEW";
}
