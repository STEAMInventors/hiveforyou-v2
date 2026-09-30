import type { HiveDiscoverRun } from "@hiveforyou/shared/discover";

import type { DiscoverArtifactRecord, DiscoverArtifactRepository } from "./repositories";

type ArtifactFields = Omit<DiscoverArtifactRecord, "discoverRunId" | "caseId" | "userId">;

export async function saveDiscoverArtifact(
  artifactRepo: DiscoverArtifactRepository,
  run: HiveDiscoverRun,
  userId: string,
  fields: ArtifactFields,
): Promise<void> {
  const artifact: DiscoverArtifactRecord = {
    discoverRunId: run.discoverRunId,
    caseId: run.caseId,
    userId,
    ...fields,
  };
  // Temporary: trace FK mismatches after idempotency races (remove once stable).
  console.info("[discover] artifact save", {
    artifactDiscoverRunId: artifact.discoverRunId,
    runDiscoverRunId: run.discoverRunId,
  });
  await artifactRepo.save(artifact);
}
