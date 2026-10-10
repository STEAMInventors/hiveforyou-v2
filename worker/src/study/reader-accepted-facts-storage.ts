import {
  buildReaderAcceptedFactsArtifact,
  parseReaderAcceptedFactsArtifact,
  type ReaderAcceptedFactsArtifact,
} from "@hiveforyou/shared/reader-accepted-facts";
import { readerAcceptedFactsStoragePath } from "@hiveforyou/shared/hive-artifact-paths";

import type { HiveGateway } from "../persistence/hive-gateway.js";

export class ReaderAcceptedFactsStorage {
  constructor(
    private readonly gateway: HiveGateway,
    private readonly bucket: string,
  ) {}

  pathFor(userId: string, studyRunId: string): string {
    return readerAcceptedFactsStoragePath(userId, studyRunId);
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

  async save(userId: string, artifact: ReaderAcceptedFactsArtifact): Promise<void> {
    const validated = buildReaderAcceptedFactsArtifact(artifact);
    const bytes = new TextEncoder().encode(JSON.stringify(validated));
    await this.gateway.uploadObject(
      this.bucket,
      this.pathFor(userId, validated.studyRunId),
      bytes,
      "application/json",
    );
  }
}
