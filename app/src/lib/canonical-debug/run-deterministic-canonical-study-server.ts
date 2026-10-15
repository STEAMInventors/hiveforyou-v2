import "server-only";

import {
  CanonicalStudyArtifactsNotFoundError,
  DeterministicCanonicalStudyConflictError,
  PackNotAvailableError,
  RawExtractionNotFoundError,
  SourcePagesUnavailableError,
  loadDeterministicCanonicalStudyArtifact,
  runDeterministicCanonicalStudy,
  type CanonicalStudyDebugArtifactMetadata,
  type CanonicalStudyDebugReaderPackMetadata,
  type RunDeterministicCanonicalStudyResult,
} from "@hiveforyou/core";
import type { CanonicalStudyArtifact } from "@hiveforyou/shared/canonical-study-artifact";
import {
  buildDeterministicCanonicalStudyBuildEventId,
  HIVE_EVENT_DETERMINISTIC_CANONICAL_STUDY_BUILD,
  hiveDeterministicCanonicalStudyBuildEventDataSchema,
} from "@hiveforyou/shared/events";
import {
  canonicalStudyRunManifestPath,
  type CanonicalStudyRunManifest,
} from "@hiveforyou/shared/canonical-study-run-manifest";

import { CaseNotFoundError } from "@/lib/canonical-study/study-service-server";
import { StudyRunNotFoundError } from "@/lib/case-map/case-map-bundle-service-server";
import { inngest } from "@/lib/inngest/client";
import { createSupabaseHiveGateway, type HiveGateway } from "@/lib/persistence/hive-gateway";
import {
  SupabaseCaseRepository,
  SupabaseSourceDocumentRepository,
  SupabaseStudyContextRepository,
  SupabaseStudyRunRepository,
} from "@/lib/persistence/supabase-repositories";
import { SupabaseStudyArtifactRepository } from "@/lib/persistence/supabase-study-artifacts";
import { createServerSupabaseClient, getAuthenticatedUserId } from "@/lib/supabase/server";
import { requireSessionUserId } from "@hiveforyou/core";

const DOCUMENT_PAGES_BUCKET = "document-pages";

export {
  CanonicalStudyArtifactsNotFoundError,
  PackNotAvailableError,
  RawExtractionNotFoundError,
  SourcePagesUnavailableError,
};

export type {
  CanonicalStudyDebugArtifactMetadata,
  CanonicalStudyDebugReaderPackMetadata,
  RunDeterministicCanonicalStudyResult,
};

function deterministicCanonicalStudyExecutor(): "worker" | "inline" {
  const mode = process.env.HIVE_DETERMINISTIC_CANONICAL_STUDY_EXECUTOR?.trim().toLowerCase();
  if (mode === "inline") {
    return "inline";
  }
  if (mode === "worker") {
    return "worker";
  }
  return process.env.NODE_ENV === "test" ? "inline" : "worker";
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollWorkerBuildResult(input: {
  gateway: HiveGateway;
  userId: string;
  studyRunId: string;
  timeoutMs: number;
}): Promise<CanonicalStudyRunManifest> {
  const manifestPath = canonicalStudyRunManifestPath(input.userId, input.studyRunId);
  const started = Date.now();
  while (Date.now() - started < input.timeoutMs) {
    try {
      const bytes = await input.gateway.downloadObject(DOCUMENT_PAGES_BUCKET, manifestPath);
      const manifest = JSON.parse(new TextDecoder().decode(bytes)) as CanonicalStudyRunManifest;
      if (manifest.schemaVersion === "hive.canonical-study-run-manifest/1") {
        if (manifest.status === "FAILED") {
          throw new Error(manifest.errorCode ?? "DETERMINISTIC_CANONICAL_STUDY_FAILED");
        }
        return manifest;
      }
    } catch (error) {
      if (error instanceof Error && error.message !== "Object not found") {
        const message = error.message;
        if (message !== "The resource was not found" && !/not found|NOT_FOUND/i.test(message)) {
          throw error;
        }
      }
    }
    await sleep(750);
  }
  throw new Error("DETERMINISTIC_CANONICAL_STUDY_BUILD_TIMEOUT");
}

async function buildStudyDeps(input: {
  sessionUserId: string;
  gateway: HiveGateway;
  caseId: string;
  studyRunId: string;
}) {
  const ownedCase = await new SupabaseCaseRepository(input.gateway, input.sessionUserId).getById(
    input.sessionUserId,
    input.caseId,
  );
  if (!ownedCase) {
    throw new CaseNotFoundError();
  }

  const run = await new SupabaseStudyRunRepository(input.gateway, input.sessionUserId).getByStudyRunId(
    input.studyRunId,
  );
  if (!run || run.caseId !== input.caseId) {
    throw new StudyRunNotFoundError();
  }

  return {
    storage: input.gateway,
    studyArtifactRepo: new SupabaseStudyArtifactRepository(input.gateway, input.sessionUserId),
    contextRepo: new SupabaseStudyContextRepository(input.gateway, input.sessionUserId),
    sourceDocuments: new SupabaseSourceDocumentRepository(input.gateway, input.sessionUserId),
  };
}

export async function runDeterministicCanonicalStudyForSession(input: {
  caseId: string;
  studyRunId: string;
}): Promise<RunDeterministicCanonicalStudyResult> {
  const sessionUserId = requireSessionUserId(await getAuthenticatedUserId());
  const gateway = createSupabaseHiveGateway(await createServerSupabaseClient());
  const deps = await buildStudyDeps({
    sessionUserId,
    gateway,
    caseId: input.caseId,
    studyRunId: input.studyRunId,
  });

  if (deterministicCanonicalStudyExecutor() === "inline") {
    return runDeterministicCanonicalStudy({
      userId: sessionUserId,
      caseId: input.caseId,
      studyRunId: input.studyRunId,
      ...deps,
    });
  }

  const eventData = hiveDeterministicCanonicalStudyBuildEventDataSchema.parse({
    userId: sessionUserId,
    caseId: input.caseId,
    studyRunId: input.studyRunId,
  });

  await inngest.send({
    id: buildDeterministicCanonicalStudyBuildEventId(input.studyRunId),
    name: HIVE_EVENT_DETERMINISTIC_CANONICAL_STUDY_BUILD,
    data: eventData,
  });

  const timeoutMs = Number(process.env.HIVE_DETERMINISTIC_CANONICAL_STUDY_POLL_MS ?? "180000");
  const manifest = await pollWorkerBuildResult({
    gateway,
    userId: sessionUserId,
    studyRunId: input.studyRunId,
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 180_000,
  });

  const artifactBytes = await gateway.downloadObject(DOCUMENT_PAGES_BUCKET, manifest.artifactObjectKey);
  const foundationBytes = await gateway.downloadObject(
    DOCUMENT_PAGES_BUCKET,
    manifest.foundationObjectKey,
  );
  const artifact = JSON.parse(new TextDecoder().decode(artifactBytes)) as RunDeterministicCanonicalStudyResult["artifact"];
  const foundation = JSON.parse(new TextDecoder().decode(foundationBytes)) as RunDeterministicCanonicalStudyResult["foundation"];

  return {
    studyRunId: input.studyRunId,
    attemptId: manifest.latestAttemptId,
    foundation,
    artifact,
    foundationObjectKey: manifest.foundationObjectKey,
    artifactObjectKey: manifest.artifactObjectKey,
    readerPack: artifact.readerPack,
    canonicalRuleset: artifact.canonicalRuleset,
    runManifest: manifest,
  };
}

export async function loadDeterministicCanonicalStudyArtifactForSession(input: {
  caseId: string;
  studyRunId: string;
}): Promise<CanonicalStudyArtifact & CanonicalStudyDebugArtifactMetadata> {
  const sessionUserId = requireSessionUserId(await getAuthenticatedUserId());
  const gateway = createSupabaseHiveGateway(await createServerSupabaseClient());
  const deps = await buildStudyDeps({
    sessionUserId,
    gateway,
    caseId: input.caseId,
    studyRunId: input.studyRunId,
  });

  return loadDeterministicCanonicalStudyArtifact({
    userId: sessionUserId,
    studyRunId: input.studyRunId,
    storage: gateway,
    studyArtifactRepo: deps.studyArtifactRepo,
    contextRepo: deps.contextRepo,
  });
}

export { DeterministicCanonicalStudyConflictError };
