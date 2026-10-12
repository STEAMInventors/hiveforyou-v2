import { createHash } from "node:crypto";

import {
  buildReaderAcceptedFactsArtifact,
  parseReaderAcceptedFactsArtifact,
  type ReaderAcceptedFactsArtifact,
} from "@hiveforyou/shared/reader-accepted-facts";
import {
  readerAcceptedFactsAttemptStoragePath,
  readerAcceptedFactsStoragePath,
} from "@hiveforyou/shared/hive-artifact-paths";

import type { HiveGateway } from "../persistence/hive-gateway.js";

function artifactContentSha256(artifact: ReaderAcceptedFactsArtifact): string {
  return createHash("sha256").update(JSON.stringify(artifact)).digest("hex");
}

export class ReaderAcceptedFactsStorage {
  constructor(
    private readonly gateway: HiveGateway,
    private readonly bucket: string,
  ) {}

  pathFor(userId: string, studyRunId: string): string {
    return readerAcceptedFactsStoragePath(userId, studyRunId);
  }

  pathForAttempt(userId: string, studyRunId: string, attemptId: string): string {
    return readerAcceptedFactsAttemptStoragePath(userId, studyRunId, attemptId);
  }

  async load(userId: string, studyRunId: string): Promise<ReaderAcceptedFactsArtifact | null> {
    try {
      const bytes = await this.gateway.downloadObject(
        this.bucket,
        this.pathFor(userId, studyRunId),
      );
      return parseReaderAcceptedFactsArtifact(JSON.parse(new TextDecoder().decode(bytes)) as unknown);
    } catch {
      return null;
    }
  }

  async loadAttempt(
    userId: string,
    studyRunId: string,
    attemptId: string,
  ): Promise<ReaderAcceptedFactsArtifact | null> {
    try {
      const bytes = await this.gateway.downloadObject(
        this.bucket,
        this.pathForAttempt(userId, studyRunId, attemptId),
      );
      return parseReaderAcceptedFactsArtifact(JSON.parse(new TextDecoder().decode(bytes)) as unknown);
    } catch {
      return null;
    }
  }

  async save(userId: string, artifact: ReaderAcceptedFactsArtifact): Promise<void> {
    const validated = buildReaderAcceptedFactsArtifact(artifact);
    const bytes = new TextEncoder().encode(JSON.stringify(validated));
    const contentHash = artifactContentSha256(validated);

    const attemptPath = this.pathForAttempt(userId, validated.studyRunId, validated.attemptId);
    const existingAttempt = await this.loadAttempt(userId, validated.studyRunId, validated.attemptId);
    if (existingAttempt) {
      if (artifactContentSha256(existingAttempt) !== contentHash) {
        throw new Error("READER_ACCEPTED_FACTS_ATTEMPT_CONFLICT");
      }
    } else {
      await this.gateway.uploadObject(this.bucket, attemptPath, bytes, "application/json");
    }

    await this.gateway.uploadObject(
      this.bucket,
      this.pathFor(userId, validated.studyRunId),
      bytes,
      "application/json",
    );
  }
}
