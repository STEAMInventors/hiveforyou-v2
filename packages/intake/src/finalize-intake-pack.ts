import { completeIntakeDomainPack } from "./complete-intake-domain";
import type { IntakeExecutionDeps } from "./execute-intake";
import type { DocumentNormalizedExtractionRecord, IntakeRunRecord } from "./types";
import { NORMALIZED_EXTRACTION_SCHEMA_VERSION } from "@hiveforyou/shared/intake";

export async function finalizeIntakeRunPack(
  deps: IntakeExecutionDeps,
  run: IntakeRunRecord,
): Promise<IntakeRunRecord> {
  const latestIdentities = await deps.identities.listByRun(run.userId, run.id);
  const metadata =
    (await deps.sourceMetadata?.({
      userId: run.userId,
      sourceDocumentIds: latestIdentities.map((row) => row.sourceDocumentId),
    })) ?? {};
  const normalizedBySourceId: Record<string, DocumentNormalizedExtractionRecord> = {};
  if (deps.normalizedExtractions) {
    for (const identity of latestIdentities) {
      const meta = metadata[identity.sourceDocumentId];
      if (!meta) {
        continue;
      }
      const normalized = await deps.normalizedExtractions.getBySourceHash(
        run.userId,
        identity.sourceDocumentId,
        meta.sourceHash,
      );
      if (
        normalized &&
        normalized.schemaVersion === NORMALIZED_EXTRACTION_SCHEMA_VERSION &&
        normalized.normalizedExtraction.schemaVersion === NORMALIZED_EXTRACTION_SCHEMA_VERSION
      ) {
        normalizedBySourceId[identity.sourceDocumentId] = normalized;
      }
    }
  }
  const completed = await completeIntakeDomainPack({
    run,
    identities: latestIdentities,
    filenamesBySourceId: Object.fromEntries(
      Object.entries(metadata).map(([id, meta]) => [id, meta.filename]),
    ),
    normalizedBySourceId,
    decideDomain: deps.decideDomain,
  });
  return completed.run;
}
