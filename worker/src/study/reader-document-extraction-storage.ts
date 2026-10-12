import { createHash } from "node:crypto";

import {
  readerDocumentExtractionAttemptManifestPath,
  readerDocumentExtractionEnvelopePath,
  readerDocumentExtractionStudyRunManifestPath,
} from "@hiveforyou/shared/hive-artifact-paths";
import {
  buildReaderDocumentExtractionAttemptManifest,
  buildReaderDocumentExtractionEnvelope,
  parseReaderDocumentExtractionEnvelope,
  type ReaderDocumentExtractionEnvelope,
  type ReaderDocumentExtractionStudyRunManifest,
} from "@hiveforyou/shared/reader-document-extraction";

import type { HiveGateway } from "../persistence/hive-gateway.js";

function envelopeContentSha256(envelope: ReaderDocumentExtractionEnvelope): string {
  return createHash("sha256").update(JSON.stringify(envelope)).digest("hex");
}

export class ReaderDocumentExtractionStorage {
  constructor(
    private readonly gateway: HiveGateway,
    private readonly bucket: string,
  ) {}

  envelopePath(
    userId: string,
    studyRunId: string,
    attemptId: string,
    sourceDocumentId: string,
  ): string {
    return readerDocumentExtractionEnvelopePath(userId, studyRunId, attemptId, sourceDocumentId);
  }

  attemptManifestPath(userId: string, studyRunId: string, attemptId: string): string {
    return readerDocumentExtractionAttemptManifestPath(userId, studyRunId, attemptId);
  }

  studyRunManifestPath(userId: string, studyRunId: string): string {
    return readerDocumentExtractionStudyRunManifestPath(userId, studyRunId);
  }

  async loadEnvelope(
    userId: string,
    studyRunId: string,
    attemptId: string,
    sourceDocumentId: string,
  ): Promise<ReaderDocumentExtractionEnvelope | null> {
    try {
      const bytes = await this.gateway.downloadObject(
        this.bucket,
        this.envelopePath(userId, studyRunId, attemptId, sourceDocumentId),
      );
      return parseReaderDocumentExtractionEnvelope(JSON.parse(new TextDecoder().decode(bytes)) as unknown);
    } catch {
      return null;
    }
  }

  async persistAttemptEnvelopes(input: {
    userId: string;
    envelopes: unknown[];
    updatedAt: string;
  }): Promise<{
    attemptManifestPath: string;
    studyRunManifestPath: string;
    envelopePaths: string[];
  }> {
    if (input.envelopes.length === 0) {
      throw new Error("READER_DOCUMENT_EXTRACTION_EMPTY");
    }

    const validated = input.envelopes.map((raw) => buildReaderDocumentExtractionEnvelope(raw as ReaderDocumentExtractionEnvelope));
    const studyRunId = validated[0]!.studyRunId;
    const attemptId = validated[0]!.attemptId;
    const caseId = validated[0]!.caseId;

    for (const envelope of validated) {
      if (envelope.studyRunId !== studyRunId || envelope.attemptId !== attemptId || envelope.caseId !== caseId) {
        throw new Error("READER_DOCUMENT_EXTRACTION_CORRELATION_MISMATCH");
      }
      if (envelope.userId !== input.userId) {
        throw new Error("READER_DOCUMENT_EXTRACTION_OWNER_MISMATCH");
      }
    }

    const envelopePaths: string[] = [];
    for (const envelope of validated) {
      const objectKey = this.envelopePath(
        input.userId,
        envelope.studyRunId,
        envelope.attemptId,
        envelope.sourceDocumentId,
      );
      const bytes = new TextEncoder().encode(JSON.stringify(envelope));
      const contentHash = envelopeContentSha256(envelope);
      const existing = await this.loadEnvelope(
        input.userId,
        envelope.studyRunId,
        envelope.attemptId,
        envelope.sourceDocumentId,
      );
      if (existing) {
        if (envelopeContentSha256(existing) !== contentHash) {
          throw new Error("READER_DOCUMENT_EXTRACTION_ATTEMPT_CONFLICT");
        }
      } else {
        await this.gateway.uploadObject(this.bucket, objectKey, bytes, "application/json");
      }
      envelopePaths.push(objectKey);
    }

    const attemptManifest = buildReaderDocumentExtractionAttemptManifest({
      studyRunId,
      attemptId,
      caseId,
      updatedAt: input.updatedAt,
      documents: validated.map((envelope) => ({
        sourceDocumentId: envelope.sourceDocumentId,
        status: envelope.status,
        envelopeObjectKey: this.envelopePath(
          input.userId,
          envelope.studyRunId,
          envelope.attemptId,
          envelope.sourceDocumentId,
        ),
      })),
    });
    const attemptManifestPath = this.attemptManifestPath(input.userId, studyRunId, attemptId);
    const attemptManifestBytes = new TextEncoder().encode(JSON.stringify(attemptManifest));
    await this.gateway.uploadObject(
      this.bucket,
      attemptManifestPath,
      attemptManifestBytes,
      "application/json",
    );

    const studyRunManifest: ReaderDocumentExtractionStudyRunManifest = {
      schemaVersion: "hive.reader-document-extraction-manifest/1",
      studyRunId,
      caseId,
      latestAttemptId: attemptId,
      updatedAt: input.updatedAt,
      latestAttemptManifestObjectKey: attemptManifestPath,
    };
    const studyRunManifestPath = this.studyRunManifestPath(input.userId, studyRunId);
    await this.gateway.uploadObject(
      this.bucket,
      studyRunManifestPath,
      new TextEncoder().encode(JSON.stringify(studyRunManifest)),
      "application/json",
    );

    return { attemptManifestPath, studyRunManifestPath, envelopePaths };
  }
}
