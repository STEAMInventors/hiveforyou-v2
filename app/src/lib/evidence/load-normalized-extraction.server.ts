import "server-only";

import type { NormalizedDocumentExtraction } from "@hiveforyou/shared/intake";

import type { SupabaseIntakeRepository } from "@/lib/persistence/supabase-intake";

/** Load persisted normalized extraction, trying each known source document id for the hash. */
export async function loadNormalizedExtractionForSource(input: {
  intake: SupabaseIntakeRepository;
  userId: string;
  sourceHash: string;
  candidateSourceDocumentIds: string[];
}): Promise<NormalizedDocumentExtraction | null> {
  const seen = new Set<string>();
  for (const sourceDocumentId of input.candidateSourceDocumentIds) {
    if (!sourceDocumentId || seen.has(sourceDocumentId)) {
      continue;
    }
    seen.add(sourceDocumentId);
    const record = await input.intake.getBySourceHash(
      input.userId,
      sourceDocumentId,
      input.sourceHash,
    );
    if (record?.normalizedExtraction) {
      return record.normalizedExtraction;
    }
  }
  return null;
}
