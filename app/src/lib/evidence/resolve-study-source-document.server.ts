import "server-only";

import type { StudySourceDocumentRef } from "@hiveforyou/shared/canonical-study";
import type { StructureMap } from "@hiveforyou/shared/discover";
import type { CanonicalCaseSnapshot } from "@hiveforyou/shared/case-intelligence/3";

import type { SourceDocumentRecord } from "@hiveforyou/core";
import type { SourceDocumentRepository } from "@hiveforyou/core";

function refMatchesRequestedId(ref: StudySourceDocumentRef, requestedId: string): boolean {
  return (
    ref.sourceDocumentId === requestedId ||
    ref.stagedDocumentId === requestedId ||
    ref.discoveryDocumentId === requestedId
  );
}

function newestRecord(records: SourceDocumentRecord[]): SourceDocumentRecord | null {
  if (!records.length) {
    return null;
  }
  return [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]!;
}

export function matchStudySourceDocumentRef(
  snapshot: CanonicalCaseSnapshot | null,
  requestedId: string,
): StudySourceDocumentRef | null {
  if (!snapshot) {
    return null;
  }
  return snapshot.sourceDocuments.find((ref) => refMatchesRequestedId(ref, requestedId)) ?? null;
}

export async function resolvePersistedSourceDocumentForStudy(input: {
  documents: SourceDocumentRepository;
  userId: string;
  caseId: string;
  requestedSourceDocumentId: string;
  snapshot: CanonicalCaseSnapshot | null;
  structureMap: StructureMap | null;
}): Promise<SourceDocumentRecord | null> {
  const { documents, userId, caseId, requestedSourceDocumentId, snapshot, structureMap } = input;

  const direct = await documents.getById(userId, requestedSourceDocumentId);
  if (direct && direct.caseId === caseId) {
    return direct;
  }

  const meta = matchStudySourceDocumentRef(snapshot, requestedSourceDocumentId);

  if (meta?.sourceDocumentId) {
    const byPersistedId = await documents.getById(userId, meta.sourceDocumentId);
    if (byPersistedId && byPersistedId.caseId === caseId) {
      return byPersistedId;
    }
  }

  if (meta?.stagedDocumentId) {
    const byStaged = await documents.findByClientStagedId(userId, caseId, meta.stagedDocumentId);
    if (byStaged) {
      return byStaged;
    }
  }

  const logical = structureMap?.logicalDocuments.find(
    (doc) =>
      doc.id === requestedSourceDocumentId || doc.sourceDocumentId === requestedSourceDocumentId,
  );
  if (logical?.sourceDocumentId) {
    const byLogical = await documents.getById(userId, logical.sourceDocumentId);
    if (byLogical && byLogical.caseId === caseId) {
      return byLogical;
    }
  }

  const caseDocs = await documents.listByCase(userId, caseId);

  if (/\.pdf$/i.test(requestedSourceDocumentId)) {
    const byRequestedFilename = caseDocs.filter(
      (doc) => doc.originalFilename === requestedSourceDocumentId,
    );
    const chosen = newestRecord(byRequestedFilename);
    if (chosen) {
      return chosen;
    }
  }

  const logicalFilename = logical?.title?.trim();
  if (logicalFilename) {
    const byLogicalName = caseDocs.filter((doc) => doc.originalFilename === logicalFilename);
    const chosen = newestRecord(byLogicalName);
    if (chosen) {
      return chosen;
    }
  }

  if (meta?.storagePath && meta.storageBucket) {
    const byStorage = caseDocs.find(
      (doc) =>
        doc.storagePath === meta.storagePath && doc.storageBucket === meta.storageBucket,
    );
    if (byStorage) {
      return byStorage;
    }
  }

  if (meta?.originalFilename) {
    const byFilename = caseDocs.filter((doc) => doc.originalFilename === meta.originalFilename);
    const chosen = newestRecord(byFilename);
    if (chosen) {
      return chosen;
    }
  }

  if (meta?.sha256) {
    const byHash = caseDocs.filter((doc) => doc.sha256 === meta.sha256);
    const chosen = newestRecord(byHash);
    if (chosen) {
      return chosen;
    }
  }

  return null;
}
