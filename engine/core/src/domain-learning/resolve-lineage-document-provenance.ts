import type { CanonicalStudyContext } from "@hiveforyou/shared/canonical-study";
import type { EvidenceReference } from "@hiveforyou/shared/canonical-study";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function persistedSourceDocumentId(
  context: CanonicalStudyContext,
  candidate: string,
): string | null {
  for (const doc of context.sourceDocuments) {
    if (
      doc.sourceDocumentId === candidate ||
      doc.stagedDocumentId === candidate ||
      doc.discoveryDocumentId === candidate
    ) {
      return doc.sourceDocumentId ?? doc.stagedDocumentId;
    }
  }
  return isUuid(candidate) ? candidate : null;
}

/**
 * Maps validated evidence refs to durable lineage columns:
 * - logical_document_id: opaque Structure Map id (text)
 * - source_document_id: hive.source_documents uuid when known
 */
export function resolveLineageDocumentProvenance(
  ref: EvidenceReference,
  context: CanonicalStudyContext,
): { logicalDocumentId: string | null; sourceDocumentId: string | null } {
  const logicalById = new Map(context.logicalDocuments.map((doc) => [doc.id, doc]));
  const logicalFromSourceRef = logicalById.get(ref.sourceDocumentId);
  const logicalFromExplicit = ref.logicalDocumentId
    ? logicalById.get(ref.logicalDocumentId)
    : undefined;
  const logical = logicalFromExplicit ?? logicalFromSourceRef;
  const logicalDocumentId =
    ref.logicalDocumentId ?? logicalFromSourceRef?.id ?? logical?.id ?? null;

  if (logical?.sourceDocumentId) {
    const sourceDocumentId = persistedSourceDocumentId(context, logical.sourceDocumentId);
    if (sourceDocumentId) {
      return {
        logicalDocumentId: logicalDocumentId ?? logical.id,
        sourceDocumentId,
      };
    }
  }

  return {
    logicalDocumentId,
    sourceDocumentId: persistedSourceDocumentId(context, ref.sourceDocumentId),
  };
}
