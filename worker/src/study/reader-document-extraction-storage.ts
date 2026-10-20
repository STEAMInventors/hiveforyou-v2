import { createHash } from "node:crypto";

import {
  buildPackDrivenReaderDocumentRawArtifact,
  buildPackDrivenReaderDocumentValidatedArtifact,
  buildPackDrivenReaderStudyManifestArtifact,
} from "@hiveforyou/core/study";
import type { ProposalDomainPack } from "@hiveforyou/domain-pack/pack-driven-reader";
import {
  packDrivenReaderDocumentRawArtifactPath,
  packDrivenReaderDocumentValidatedArtifactPath,
  packDrivenReaderStudyManifestArtifactPath,
  readerDocumentExtractionAttemptManifestPath,
  readerDocumentExtractionEnvelopePath,
  readerDocumentExtractionStudyRunManifestPath,
} from "@hiveforyou/shared/hive-artifact-paths";
import type {
  PackDrivenReaderDocumentValidatedArtifact,
  PackDrivenReaderStudyManifestArtifact,
} from "@hiveforyou/shared/pack-driven-reader-artifacts";
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

function artifactContentSha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
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

export class PackDrivenReaderArtifactStorage {
  constructor(
    private readonly gateway: HiveGateway,
    private readonly bucket: string,
  ) {}

  async persistStudyReaderArtifacts(input: {
    userId: string;
    pack: ProposalDomainPack;
    envelopes: ReaderDocumentExtractionEnvelope[];
    perDocumentResults: unknown[] | null | undefined;
    logicalDocumentIdBySourceDocumentId: Map<string, string>;
    discoverDocumentTypeIdBySourceDocumentId?: Map<string, string | null>;
    discoverDocumentTypeLabelBySourceDocumentId?: Map<string, string | null>;
    promptCompilerVersion?: string | null;
    updatedAt: string;
  }): Promise<{
    studyManifestPath: string;
    documentPaths: Array<{ logicalDocumentId: string; rawPath: string; validatedPath: string }>;
    manifest: PackDrivenReaderStudyManifestArtifact;
  }> {
    if (input.envelopes.length === 0) {
      throw new Error("PACK_DRIVEN_READER_ARTIFACT_EMPTY");
    }

    const perDocumentBySource = new Map<string, Record<string, unknown>>();
    for (const row of input.perDocumentResults ?? []) {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        continue;
      }
      const record = row as Record<string, unknown>;
      const sourceDocumentId = record.sourceDocumentId;
      if (typeof sourceDocumentId === "string" && sourceDocumentId.trim()) {
        perDocumentBySource.set(sourceDocumentId.trim(), record);
      }
    }

    const validatedByLogical = new Map<string, PackDrivenReaderDocumentValidatedArtifact>();
    const documentPaths: Array<{ logicalDocumentId: string; rawPath: string; validatedPath: string }> =
      [];

    for (const envelope of input.envelopes) {
      if (envelope.userId !== input.userId) {
        throw new Error("PACK_DRIVEN_READER_ARTIFACT_OWNER_MISMATCH");
      }
      const logicalDocumentId =
        input.logicalDocumentIdBySourceDocumentId.get(envelope.sourceDocumentId) ??
        envelope.sourceDocumentId;
      const rawArtifact = buildPackDrivenReaderDocumentRawArtifact({
        envelope,
        logicalDocumentId,
        promptCompilerVersion: input.promptCompilerVersion,
      });
      const validatedArtifact = buildPackDrivenReaderDocumentValidatedArtifact({
        envelope,
        logicalDocumentId,
        pack: input.pack,
        perDocumentWire: perDocumentBySource.get(envelope.sourceDocumentId) ?? null,
        discoverDocumentTypeId:
          input.discoverDocumentTypeIdBySourceDocumentId?.get(envelope.sourceDocumentId) ?? null,
        discoverDocumentTypeLabel:
          input.discoverDocumentTypeLabelBySourceDocumentId?.get(envelope.sourceDocumentId) ?? null,
        updatedAt: input.updatedAt,
      });

      const rawPath = packDrivenReaderDocumentRawArtifactPath(
        input.userId,
        envelope.studyRunId,
        logicalDocumentId,
      );
      const validatedPath = packDrivenReaderDocumentValidatedArtifactPath(
        input.userId,
        envelope.studyRunId,
        logicalDocumentId,
      );

      await this.uploadIfAbsent(rawPath, rawArtifact);
      await this.uploadIfAbsent(validatedPath, validatedArtifact);

      validatedByLogical.set(logicalDocumentId, validatedArtifact);
      documentPaths.push({ logicalDocumentId, rawPath, validatedPath });
    }

    const manifest = buildPackDrivenReaderStudyManifestArtifact({
      userId: input.userId,
      attemptId: input.envelopes[0]!.attemptId,
      envelopes: input.envelopes,
      validatedByLogicalDocumentId: validatedByLogical,
      logicalDocumentIdBySourceDocumentId: input.logicalDocumentIdBySourceDocumentId,
      promptCompilerVersion: input.promptCompilerVersion,
      createdAt: input.updatedAt,
      complete: true,
    });
    const studyManifestPath = packDrivenReaderStudyManifestArtifactPath(
      input.userId,
      input.envelopes[0]!.studyRunId,
    );
    await this.uploadIfAbsent(studyManifestPath, manifest);

    return { studyManifestPath, documentPaths, manifest };
  }

  private async uploadIfAbsent(objectKey: string, payload: unknown): Promise<void> {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const incomingHash = artifactContentSha256(payload);
    try {
      const existingBytes = await this.gateway.downloadObject(this.bucket, objectKey);
      const existing = JSON.parse(new TextDecoder().decode(existingBytes)) as unknown;
      if (artifactContentSha256(existing) !== incomingHash) {
        throw new Error(`PACK_DRIVEN_READER_ARTIFACT_CONFLICT:${objectKey}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith("PACK_DRIVEN_READER_ARTIFACT_CONFLICT:")) {
        throw error;
      }
      await this.gateway.uploadObject(this.bucket, objectKey, bytes, "application/json");
    }
  }
}
