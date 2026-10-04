import { createHash } from "node:crypto";

import { INTAKE_CLASSIFIER, INTAKE_IDENTITY_CONFIG_ID } from "@hiveforyou/shared/intake";

export function buildIntakeIdempotencyKey(sourceDocumentIds: string[]): string {
  const payload = {
    sourceDocumentIds: [...sourceDocumentIds].sort(),
    questionConfig: INTAKE_IDENTITY_CONFIG_ID,
    classifier: INTAKE_CLASSIFIER,
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function intakeFlightKey(caseId: string, idempotencyKey: string): string {
  return `${caseId}:${idempotencyKey}`;
}
