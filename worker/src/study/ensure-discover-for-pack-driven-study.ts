import {
  buildEngine1ResultFromIntakePack,
  fingerprintIntakeStudyMaterial,
  intakePackExecutionToStructureMap,
  mapStructureMapToDocumentDiscovery,
  resolveIntakeStudyDomain,
} from "@hiveforyou/core";
import { getDiscoverPackByDomainId } from "@hiveforyou/domain-packs";
import { parsePackExecution } from "@hiveforyou/intake";
import type { StartCanonicalStudyRequest } from "@hiveforyou/shared/canonical-study";
import type { StructureMap } from "@hiveforyou/shared/discover/structure-map";
import type { DocumentDiscoveryResult } from "@hiveforyou/shared/discovery";

import type { WorkerSourceDocumentRepository } from "../intake/worker-source-documents.js";
import type { WorkerIntakeRepository } from "../persistence/worker-intake-repository.js";
import type { HiveGateway } from "../persistence/hive-gateway.js";
import {
  WorkerDiscoverArtifactRepository,
} from "../persistence/worker-discover-repositories.js";
import { loadLatestStructureMapForCase } from "../persistence/supabase-case-projections.js";
export type PackDrivenEngine1Source = "discover_artifact" | "intake_pack_execution";

export type EnsureDiscoverForStudyResult =
  | {
      ok: true;
      reused: boolean;
      engine1Source: PackDrivenEngine1Source;
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
  if (
    fallbackMap &&
    structureMapCoversSources(fallbackMap, input.present) &&
    fallbackMap.provenance?.providerId !== "intake-domain-pack"
  ) {
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

async function loadEngine1FromIntakePackExecution(input: {
  intake: WorkerIntakeRepository;
  documents: WorkerSourceDocumentRepository;
  userId: string;
  caseId: string;
  intakeRunId: string;
  domainId: string;
  domainLabel: string;
  present: ReadonlyArray<{ sourceDocumentId: string; sha256: string }>;
  request: StartCanonicalStudyRequest;
}): Promise<{
  structureMap: StructureMap;
  documentDiscovery: DocumentDiscoveryResult;
  discoverStructureFingerprint: string;
} | null> {
  const run = await input.intake.getById(input.userId, input.intakeRunId);
  if (!run?.packExecutionJson) {
    return null;
  }
  const packExecution = parsePackExecution(run.packExecutionJson);
  if (!packExecution) {
    return null;
  }
  const domain = resolveIntakeStudyDomain({
    resolvedDomainId: run.resolvedDomainId ?? input.domainId,
    domainLabel: input.domainLabel,
  });
  if (!domain) {
    return null;
  }

  const identities = await input.intake.listByRun(input.userId, input.intakeRunId);
  const presentIds = new Set(input.present.map((row) => row.sourceDocumentId));
  const sources = (await input.documents.listByCase(input.userId, input.caseId)).map((doc) => ({
    id: doc.id,
    originalFilename: doc.originalFilename ?? "Document",
    sizeBytes: doc.sizeBytes ?? 0,
    mimeType: doc.mimeType,
    sha256: doc.sha256,
    storageBucket: doc.storageBucket,
    storagePath: doc.storagePath,
  }));

  const structureMap = intakePackExecutionToStructureMap({
    caseId: input.caseId,
    intakeRunId: input.intakeRunId,
    domainId: domain.domainId,
    domainLabel: domain.domainLabel,
    domainPackId: domain.domainPackId,
    domainPackVersion: domain.domainPackVersion,
    packExecution,
    sources: sources as unknown as Parameters<typeof intakePackExecutionToStructureMap>[0]["sources"],
    presentSourceIds: presentIds,
  });

  if (!structureMapCoversSources(structureMap, input.present)) {
    return null;
  }

  const documentDiscovery = buildEngine1ResultFromIntakePack({
    domainId: domain.domainId,
    domainLabel: domain.domainLabel,
    packExecution,
    presentSourceIds: presentIds,
  });

  const discoverStructureFingerprint =
    input.request.intakeStudyMaterialFingerprint ??
    fingerprintIntakeStudyMaterial({
      intakeRunId: input.intakeRunId,
      packExecution,
      identities: identities.map((row) => ({
        sourceDocumentId: row.sourceDocumentId,
        analysisDisposition: row.analysisDisposition,
      })),
      sources: sources as unknown as Parameters<typeof fingerprintIntakeStudyMaterial>[0]["sources"],
    });

  return { structureMap, documentDiscovery, discoverStructureFingerprint };
}

export async function ensureDiscoverForPackDrivenStudy(input: {
  gateway: HiveGateway;
  intake: WorkerIntakeRepository;
  documents: WorkerSourceDocumentRepository;
  userId: string;
  caseId: string;
  intakeRunId: string;
  domainId: string;
  domainLabel?: string;
  request: StartCanonicalStudyRequest;
}): Promise<EnsureDiscoverForStudyResult> {
  const present = presentSourceRows(input.request);
  if (!present.length) {
    return { ok: false, code: "DISCOVER_FAILED", message: "No source documents for discover." };
  }

  const discoverPack = getDiscoverPackByDomainId(input.domainId);
  if (!discoverPack) {
    return { ok: false, code: "DISCOVER_FAILED", message: "Discover pack missing for domain." };
  }

  const reusedDiscover = await loadReusableDiscover({
    gateway: input.gateway,
    userId: input.userId,
    caseId: input.caseId,
    present,
  });
  if (reusedDiscover) {
    const fingerprint =
      input.request.intakeStudyMaterialFingerprint ??
      reusedDiscover.structureMap.provenance?.promptSha256 ??
      "discover-artifact";
    return {
      ok: true,
      reused: true,
      engine1Source: "discover_artifact",
      discoverRunId: reusedDiscover.discoverRunId,
      structureMap: reusedDiscover.structureMap,
      documentDiscovery: reusedDiscover.documentDiscovery,
      discoverStructureFingerprint: fingerprint,
    };
  }

  const fromIntake = await loadEngine1FromIntakePackExecution({
    intake: input.intake,
    documents: input.documents,
    userId: input.userId,
    caseId: input.caseId,
    intakeRunId: input.intakeRunId,
    domainId: input.domainId,
    domainLabel: input.domainLabel ?? input.request.engine1Result.domainLabel,
    present,
    request: input.request,
  });
  if (fromIntake) {
    return {
      ok: true,
      reused: false,
      engine1Source: "intake_pack_execution",
      discoverRunId: input.intakeRunId,
      structureMap: fromIntake.structureMap,
      documentDiscovery: fromIntake.documentDiscovery,
      discoverStructureFingerprint: fromIntake.discoverStructureFingerprint,
    };
  }

  return {
    ok: false,
    code: "DISCOVER_FAILED",
    message:
      "Pack-driven study requires a persisted structure map from Intake pack execution or a prior Discover run.",
  };
}
