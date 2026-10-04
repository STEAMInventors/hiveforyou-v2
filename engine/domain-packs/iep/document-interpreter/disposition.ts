import type { DocumentIdentityType } from "@hiveforyou/shared/intake";
import type { IntakePackProcessingDisposition } from "@hiveforyou/domain-pack";

import type { IepLocalClassification } from "./contracts";

const UNRELATED_GENERIC_IDENTITIES = new Set<DocumentIdentityType>([
  "bank_statement",
  "tax_return",
  "pay_stub",
  "bankruptcy_filing",
]);

const REVIEW_CONFIDENCE = 0.7;

export function iepProcessingDisposition(input: {
  classification: IepLocalClassification;
  genericIdentity: DocumentIdentityType | null;
}): IntakePackProcessingDisposition {
  if (
    input.genericIdentity &&
    UNRELATED_GENERIC_IDENTITIES.has(input.genericIdentity) &&
    input.classification.family === "OTHER"
  ) {
    return "DO_NOT_PROCESS";
  }
  if (input.classification.family === "EXTERNAL" && input.classification.confidence < 0.75) {
    return "DO_NOT_PROCESS";
  }
  if (
    input.classification.subtype == null ||
    input.classification.confidence < REVIEW_CONFIDENCE ||
    input.classification.classificationReason === "unmatched"
  ) {
    return "NEEDS_REVIEW";
  }
  return "PROCESS";
}
