import type { CanonicalStudyContext } from "@hiveforyou/shared/canonical-study";
import type { StudySourceDocumentRef } from "@hiveforyou/shared/canonical-study";

export type StudySourceBytesLoader = (
  ref: StudySourceDocumentRef,
) => Promise<Uint8Array>;

/**
 * Loads bytes for each source document referenced on the study context.
 * Keys include stagedDocumentId, sourceDocumentId, and discoveryDocumentId when present.
 */
export async function loadStudySourceDocumentBytes(
  context: CanonicalStudyContext,
  loadBytes: StudySourceBytesLoader,
): Promise<Map<string, Uint8Array>> {
  const map = new Map<string, Uint8Array>();
  for (const ref of context.sourceDocuments) {
    const bytes = await loadBytes(ref);
    map.set(ref.stagedDocumentId, bytes);
    if (ref.sourceDocumentId) {
      map.set(ref.sourceDocumentId, bytes);
    }
    if (ref.discoveryDocumentId) {
      map.set(ref.discoveryDocumentId, bytes);
    }
  }
  return map;
}
