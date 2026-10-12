import {
  buildDiscoverIdempotencyKey,
  fingerprintDiscoverStudyMaterial,
  loadDiscoverPrompt,
  mapStructureMapToDocumentDiscovery,
  runDiscover,
} from "@hiveforyou/core";
import { getDiscoverPackByDomainId } from "@hiveforyou/domain-packs";
import type { StartCanonicalStudyRequest } from "@hiveforyou/shared/canonical-study";
import type { StructureMap } from "@hiveforyou/shared/discover/structure-map";
import type { DocumentDiscoveryResult } from "@hiveforyou/shared/discovery";

import type { WorkerSourceDocumentRepository } from "../intake/worker-source-documents.js";
import type { HiveGateway } from "../persistence/hive-gateway.js";
import {
  WorkerDiscoverArtifactRepository,
} from "../persistence/worker-discover-repositories.js";
import { loadLatestStructureMapForCase } from "../persistence/supabase-case-projections.js";
import { buildWorkerDiscoverDeps } from "../discover/build-worker-discover-deps.js";

export type EnsureDiscoverForStudyResult =
  | {
      ok: true;
      reused: boolean;
      discoverRunId: string;
      structureMap: StructureMap;
      documentDiscovery: DocumentDiscoveryResult;
      discoverStructureFingerprint: string;
    }
  | {
      ok: false;
      code: "DISCOVER_AWAITING_INPUT" | "DISCOVER_FAILED" | "DISCOVER_ENGINE_UNAVAILABLE";
      discoverRunId?: string;
      message: string;
    };

function presentSourceRows(
  request: StartCanonicalStudyRequest,
): Array<{ sourceDocumentId: string; sha256: string }> {
  return request.sourceDocuments
    .map((doc) => ({
      sourceDocumentId: doc.sourceDocumentId ?? doc.stagedDocumentId,
      sha256: doc.sha256 ?? "",
    }))
    .filter((row) => row.sourceDocumentId && row.sha256);
}

function structureMapCoversSources(
  structureMap: StructureMap,
  present: ReadonlyArray<{ sourceDocumentId: string; sha256: string }>,
): boolean {
  const sources = new Map(
    structureMap.sourceDocuments.map((doc) => [doc.sourceDocumentId, doc.sha256]),
  );
  for (const row of present) {
    if (sources.get(row.sourceDocumentId) !== row.sha256) {
      return false;
    }
  }
  return present.length > 0 && structureMap.logicalDocuments.length > 0;
}

async function loadReusableDiscover(input: {
  gateway: HiveGateway;
  userId: string;
  caseId: string;
  present: ReadonlyArray<{ sourceDocumentId: string; sha256: string }>;
}): Promise<{
  discoverRunId: string;
  structureMap: StructureMap;
  documentDiscovery: DocumentDiscoveryResult;
} | null> {
  const rows = await input.gateway.selectWhere(
    "discover_runs",
    { case_id: input.caseId, user_id: input.userId, status: "SUCCEEDED" },
    { orderBy: "completed_at", ascending: false, limit: 8 },
  );
  for (const row of rows) {
    const discoverRunId = String(row.id);
    const artifactRepo = new WorkerDiscoverArtifactRepository(input.gateway, input.userId);
    const artifact = await artifactRepo.getByDiscoverRunId(discoverRunId);
    const structureMap = artifact?.structureMapJson as StructureMap | undefined;
    const documentDiscovery = artifact?.discoveryResultJson as DocumentDiscoveryResult | undefined;
    if (!structureMap?.logicalDocuments?.length || !documentDiscovery) {
      continue;
    }
    if (!structureMapCoversSources(structureMap, input.present)) {
      continue;
    }
    return { discoverRunId, structureMap, documentDiscovery };
  }

  const fallbackMap = await loadLatestStructureMapForCase(
    input.gateway,
    input.userId,
    input.caseId,
  );
  if (fallbackMap && structureMapCoversSources(fallbackMap, input.present)) {
    const pack = getDiscoverPackByDomainId(fallbackMap.domainResolution.domainId);
    if (!pack) {
      return null;
    }
    const documentDiscovery = mapStructureMapToDocumentDiscovery(fallbackMap, pack);
    return {
      discoverRunId: fallbackMap.discoverRunId,
      structureMap: fallbackMap,
      documentDiscovery,
    };
  }
  return null;
}

export async function ensureDiscoverForPackDrivenStudy(input: {
  gateway: HiveGateway;
  documents: WorkerSourceDocumentRepository;
  userId: string;
  caseId: string;
  intakeRunId: string;
  domainId: string;
  request: StartCanonicalStudyRequest;
  env: Record<string, string | undefined>;
  discoverPromptVersion?: string;
}): Promise<EnsureDiscoverForStudyResult> {
  const present = presentSourceRows(input.request);
  if (!present.length) {
    return { ok: false, code: "DISCOVER_FAILED", message: "No source documents for discover." };
  }

  const promptVersion = input.discoverPromptVersion?.trim() || input.env.HIVE_DISCOVER_PROMPT_VERSION?.trim() || "v2";
  const prompt = loadDiscoverPrompt(promptVersion);
  const discoverPack = getDiscoverPackByDomainId(input.domainId);
  if (!discoverPack) {
    return { ok: false, code: "DISCOVER_FAILED", message: "Discover pack missing for domain." };
  }

  const materialFingerprint = fingerprintDiscoverStudyMaterial({
    domainId: input.domainId,
    presentSources: present,
    discoverPromptSha256: prompt.sha256,
    discoverPackVersion: discoverPack.domainPackVersion,
  });

  const reused = await loadReusableDiscover({
    gateway: input.gateway,
    userId: input.userId,
    caseId: input.caseId,
    present,
  });
  if (reused) {
    return {
      ok: true,
      reused: true,
      discoverRunId: reused.discoverRunId,
      structureMap: reused.structureMap,
      documentDiscovery: reused.documentDiscovery,
      discoverStructureFingerprint: materialFingerprint,
    };
  }

  const { deps: discoverDeps } = buildWorkerDiscoverDeps({
    gateway: input.gateway,
    documents: input.documents,
    userId: input.userId,
    caseId: input.caseId,
    env: input.env,
  });
  if (discoverDeps.engineConfig.mode === "unconfigured") {
    return {
      ok: false,
      code: "DISCOVER_ENGINE_UNAVAILABLE",
      message: "Discover engine is not configured.",
    };
  }

  const sourceDocumentIds = present.map((row) => row.sourceDocumentId);
  void buildDiscoverIdempotencyKey(input.caseId, sourceDocumentIds);

  const outcome = await runDiscover(
    {
      caseId: input.caseId,
      sourceDocumentIds,
      caseCustomerContextIntake: {
        domains: [
          {
            domainId: input.domainId,
            objective: (() => {
              const stated = input.request.answerSnapshot.userContext?.statedWorkPurpose;
              return typeof stated === "string" && stated.trim()
                ? stated.trim()
                : "Review uploaded documents.";
            })(),
            shareIntent: "yes",
          },
        ],
      },
    },
    discoverDeps,
  );

  if (
    outcome.run.status === "NEEDS_OBJECTIVE_INPUT" ||
    outcome.run.status === "NEEDS_DISCOVERY_INPUT"
  ) {
    return {
      ok: false,
      code: "DISCOVER_AWAITING_INPUT",
      discoverRunId: outcome.run.discoverRunId,
      message: "Discover requires customer input before study can continue.",
    };
  }

  if (outcome.run.status !== "SUCCEEDED" || !outcome.documentDiscovery) {
    return {
      ok: false,
      code: "DISCOVER_FAILED",
      discoverRunId: outcome.run.discoverRunId,
      message: outcome.run.errorMessage ?? "Discover did not succeed.",
    };
  }

  const structureMap = await loadLatestStructureMapForCase(
    input.gateway,
    input.userId,
    input.caseId,
  );
  if (!structureMap) {
    return {
      ok: false,
      code: "DISCOVER_FAILED",
      message: "Discover succeeded but structure map was not persisted.",
    };
  }

  return {
    ok: true,
    reused: false,
    discoverRunId: outcome.run.discoverRunId,
    structureMap,
    documentDiscovery: outcome.documentDiscovery,
    discoverStructureFingerprint: materialFingerprint,
  };
}
