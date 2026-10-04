import type { DocumentDiscoveryResult } from "@hiveforyou/shared/discovery";

import type { SourceDocumentRecord } from "./source-document-repository";

function newestRecord(records: SourceDocumentRecord[]): SourceDocumentRecord {
  return [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]!;
}

/**
 * Resolves one persisted source row per Engine 1 discovery document.
 * Ignores stale upload rows from prior discover/study attempts on the same case.
 */
export function resolvePhysicalSourceDocuments(input: {
  documents: SourceDocumentRecord[];
  engine1Result: DocumentDiscoveryResult;
  caseId: string;
  actorUserId: string;
}): SourceDocumentRecord[] {
  const caseDocs = input.documents.filter(
    (doc) => doc.userId === input.actorUserId && doc.caseId === input.caseId,
  );

  const discoveryDocuments = input.engine1Result.documents;
  if (!discoveryDocuments.length) {
    return dedupeExactStorageObjects(caseDocs);
  }

  const byPersistedId = new Map(caseDocs.map((doc) => [doc.id, doc]));
  const byClientStagedId = new Map<string, SourceDocumentRecord[]>();
  for (const doc of caseDocs) {
    if (!doc.clientStagedId) {
      continue;
    }
    const bucket = byClientStagedId.get(doc.clientStagedId) ?? [];
    bucket.push(doc);
    byClientStagedId.set(doc.clientStagedId, bucket);
  }

  const resolved: SourceDocumentRecord[] = [];
  const seenPersistedIds = new Set<string>();

  for (const discoveryDoc of discoveryDocuments) {
    const candidates: SourceDocumentRecord[] = [];
    const stagedId = discoveryDoc.stagedDocumentId;
    if (stagedId) {
      const byId = byPersistedId.get(stagedId);
      if (byId) {
        candidates.push(byId);
      }
      for (const row of byClientStagedId.get(stagedId) ?? []) {
        candidates.push(row);
      }
    }

    if (!candidates.length) {
      const byFilename = caseDocs.filter(
        (doc) => doc.originalFilename === discoveryDoc.originalFilename,
      );
      candidates.push(...byFilename);
    }

    if (!candidates.length) {
      continue;
    }

    const chosen = newestRecord(candidates);
    if (seenPersistedIds.has(chosen.id)) {
      continue;
    }
    seenPersistedIds.add(chosen.id);
    resolved.push(chosen);
  }

  if (resolved.length) {
    return resolved.sort((a, b) => a.originalFilename.localeCompare(b.originalFilename));
  }

  return dedupeExactStorageObjects(caseDocs);
}

/** Same storage object linked to multiple rows — keep the newest row only. */
function dedupeExactStorageObjects(documents: SourceDocumentRecord[]): SourceDocumentRecord[] {
  const byStorageKey = new Map<string, SourceDocumentRecord>();
  for (const doc of documents) {
    const key = `${doc.storageBucket}\0${doc.storagePath}`;
    const existing = byStorageKey.get(key);
    if (!existing || doc.createdAt.localeCompare(existing.createdAt) > 0) {
      byStorageKey.set(key, doc);
    }
  }
  return [...byStorageKey.values()].sort((a, b) =>
    a.originalFilename.localeCompare(b.originalFilename),
  );
}
