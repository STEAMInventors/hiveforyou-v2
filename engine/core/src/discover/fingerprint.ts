import { createHash } from "node:crypto";

export function buildDiscoverIdempotencyKey(
  caseId: string,
  sourceDocumentIds: string[],
): string {
  const sorted = [...sourceDocumentIds].sort();
  return createHash("sha256")
    .update(JSON.stringify({ caseId, sourceDocumentIds: sorted }))
    .digest("hex");
}
