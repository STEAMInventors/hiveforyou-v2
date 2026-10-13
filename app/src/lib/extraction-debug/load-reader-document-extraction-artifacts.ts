import "server-only";

import {
  assertReaderDocumentExtractionAttemptManifestObjectKey,
  assertReaderDocumentExtractionEnvelopeObjectKey,
  isStudyRawExtractionArtifact,
  orderSourceDocumentIdsForEngine1,
  type StudyRawExtractionArtifact,
} from "@hiveforyou/core";
import { readerDocumentExtractionStudyRunManifestPath } from "@hiveforyou/shared/hive-artifact-paths";
import {
  parseReaderDocumentExtractionEnvelope,
  type ReaderDocumentExtractionAttemptManifest,
  type ReaderDocumentExtractionEnvelope,
  type ReaderDocumentExtractionStudyRunManifest,
} from "@hiveforyou/shared/reader-document-extraction";
import type { StructureMapLogicalDocument } from "@hiveforyou/shared/discover/structure-map";

import type { HiveGateway } from "@/lib/persistence/hive-gateway";
import { SupabaseStudyArtifactRepository } from "@/lib/persistence/supabase-study-artifacts";

const DOCUMENT_PAGES_BUCKET = "document-pages";

async function downloadJson<T>(gateway: HiveGateway, objectKey: string): Promise<T | null> {
  try {
    const bytes = await gateway.downloadObject(DOCUMENT_PAGES_BUCKET, objectKey);
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}

function parseAttemptManifest(raw: unknown): ReaderDocumentExtractionAttemptManifest | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const record = raw as ReaderDocumentExtractionAttemptManifest;
  if (record.schemaVersion !== "hive.reader-document-extraction-manifest/1") {
    return null;
  }
  return record;
}

function parseStudyRunManifest(raw: unknown): ReaderDocumentExtractionStudyRunManifest | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const record = raw as ReaderDocumentExtractionStudyRunManifest;
  if (record.schemaVersion !== "hive.reader-document-extraction-manifest/1") {
    return null;
  }
  return record;
}

export type LoadedReaderDocumentExtractionArtifacts = {
  attemptId: string | null;
  terminalArtifact: StudyRawExtractionArtifact | null;
  studyRunManifest: ReaderDocumentExtractionStudyRunManifest | null;
  attemptManifest: ReaderDocumentExtractionAttemptManifest | null;
  envelopesBySourceDocumentId: Map<string, ReaderDocumentExtractionEnvelope>;
  orderedSourceDocumentIds: string[];
};

export async function loadReaderDocumentExtractionArtifacts(input: {
  gateway: HiveGateway;
  sessionUserId: string;
  caseId: string;
  studyRunId: string;
  logicalDocuments: StructureMapLogicalDocument[];
  fallbackSourceDocumentIds: string[];
}): Promise<LoadedReaderDocumentExtractionArtifacts> {
  const artifactRecord = await new SupabaseStudyArtifactRepository(
    input.gateway,
    input.sessionUserId,
  ).getByStudyRunId(input.studyRunId);
  const terminalArtifact = isStudyRawExtractionArtifact(artifactRecord?.rawProposalJson)
    ? artifactRecord.rawProposalJson
    : null;

  const studyRunManifestPath = readerDocumentExtractionStudyRunManifestPath(
    input.sessionUserId,
    input.studyRunId,
  );
  const studyRunManifest = parseStudyRunManifest(
    await downloadJson<unknown>(input.gateway, studyRunManifestPath),
  );

  const attemptId = terminalArtifact?.attemptId ?? studyRunManifest?.latestAttemptId ?? null;

  let attemptManifest: ReaderDocumentExtractionAttemptManifest | null = null;
  if (attemptId && studyRunManifest?.latestAttemptManifestObjectKey) {
    assertReaderDocumentExtractionAttemptManifestObjectKey({
      userId: input.sessionUserId,
      studyRunId: input.studyRunId,
      attemptId,
      objectKey: studyRunManifest.latestAttemptManifestObjectKey,
    });
    attemptManifest = parseAttemptManifest(
      await downloadJson<unknown>(input.gateway, studyRunManifest.latestAttemptManifestObjectKey),
    );
  }

  const envelopesBySourceDocumentId = new Map<string, ReaderDocumentExtractionEnvelope>();
  if (attemptId && attemptManifest) {
    for (const row of attemptManifest.documents) {
      assertReaderDocumentExtractionEnvelopeObjectKey({
        userId: input.sessionUserId,
        studyRunId: input.studyRunId,
        attemptId,
        sourceDocumentId: row.sourceDocumentId,
        objectKey: row.envelopeObjectKey,
      });
      const raw = await downloadJson<unknown>(input.gateway, row.envelopeObjectKey);
      if (!raw) {
        continue;
      }
      const envelope = parseReaderDocumentExtractionEnvelope(raw);
      envelopesBySourceDocumentId.set(row.sourceDocumentId, envelope);
    }
  }

  const orderedSourceDocumentIds = orderSourceDocumentIdsForEngine1({
    logicalDocuments: input.logicalDocuments,
    fallbackSourceDocumentIds: input.fallbackSourceDocumentIds,
  });

  return {
    attemptId,
    terminalArtifact,
    studyRunManifest,
    attemptManifest,
    envelopesBySourceDocumentId,
    orderedSourceDocumentIds,
  };
}
