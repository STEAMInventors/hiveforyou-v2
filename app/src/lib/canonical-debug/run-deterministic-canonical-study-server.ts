import "server-only";

import { createHash } from "node:crypto";

import {
  CANONICAL_STUDY_DEBUG_PACK_APPROVAL,
  PackNotAvailableError,
  buildCanonicalStudy,
  buildCanonicalStudyFoundation,
  proposalPackSnapshotPathForHash,
  requireSessionUserId,
  resolveCanonicalStudyRulesetIdentity,
  resolveDebugCanonicalStudyDomainPack,
  type CanonicalStudyRulesetIdentity,
  type PackResolutionDiagnostics,
  type ResolvedDebugCanonicalStudyDomainPack,
} from "@hiveforyou/core";
import {
  assertTrustedDocumentPagesPayload,
  bindDocumentPagesToSourceDocumentId,
  TrustedDocumentPagesError,
} from "@hiveforyou/core/document/trusted-document-pages";
import type { CanonicalStudySourceContext } from "@hiveforyou/shared/canonical-study-artifact";
import type { CanonicalStudyArtifact } from "@hiveforyou/shared/canonical-study-artifact";
import type { CanonicalStudyFoundationArtifact } from "@hiveforyou/shared/canonical-study-foundation";
import {
  canonicalStudyArtifactPath,
  canonicalStudyFoundationArtifactPath,
  documentPagesStoragePath,
} from "@hiveforyou/shared/hive-artifact-paths";
import type { ReaderDocumentExtractionEnvelope } from "@hiveforyou/shared/reader-document-extraction";

import { CaseNotFoundError } from "@/lib/canonical-study/study-service-server";
import { StudyRunNotFoundError } from "@/lib/case-map/case-map-bundle-service-server";
import { RawExtractionNotFoundError } from "@/lib/extraction-debug/raw-extraction-inspector-server";
import { loadReaderDocumentExtractionArtifacts } from "@/lib/extraction-debug/load-reader-document-extraction-artifacts";
import { createSupabaseHiveGateway, type HiveGateway } from "@/lib/persistence/hive-gateway";
import {
  SupabaseCaseRepository,
  SupabaseSourceDocumentRepository,
  SupabaseStudyContextRepository,
  SupabaseStudyRunRepository,
} from "@/lib/persistence/supabase-repositories";
import { createServerSupabaseClient, getAuthenticatedUserId } from "@/lib/supabase/server";

const DOCUMENT_PAGES_BUCKET = "document-pages";

export class CanonicalStudyArtifactsNotFoundError extends Error {
  readonly code = "CANONICAL_STUDY_ARTIFACTS_NOT_FOUND";

  constructor() {
    super("Deterministic canonical study artifacts were not found for this study run.");
    this.name = "CanonicalStudyArtifactsNotFoundError";
  }
}

export class SourcePagesUnavailableError extends Error {
  readonly code = "SOURCE_PAGES_UNAVAILABLE";

  constructor(readonly affectedDocumentIds: readonly string[]) {
    super(
      `Trusted source pages are unavailable for ${affectedDocumentIds.length} document(s) with extracted facts.`,
    );
    this.name = "SourcePagesUnavailableError";
  }
}

export type CanonicalStudyDebugReaderPackMetadata = {
  packId: string;
  packVersion: string;
  packContentSha256: string;
  packPath: string;
  packSource: ResolvedDebugCanonicalStudyDomainPack["source"];
};

export type CanonicalStudyDebugArtifactMetadata = {
  packApprovalLabel: typeof CANONICAL_STUDY_DEBUG_PACK_APPROVAL;
  customerProReportsPermitted: false;
  readerPack: CanonicalStudyDebugReaderPackMetadata;
  canonicalRuleset: CanonicalStudyRulesetIdentity;
};

function sha256Json(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function uploadIfAbsent(
  gateway: HiveGateway,
  objectKey: string,
  payload: unknown,
): Promise<void> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload, null, 2));
  const contentHash = sha256Json(payload);
  try {
    const existingBytes = await gateway.downloadObject(DOCUMENT_PAGES_BUCKET, objectKey);
    const existing = JSON.parse(new TextDecoder().decode(existingBytes)) as unknown;
    if (sha256Json(existing) !== contentHash) {
      throw new Error("CANONICAL_STUDY_ARTIFACT_CONFLICT");
    }
    return;
  } catch (error) {
    if (error instanceof Error && error.message === "CANONICAL_STUDY_ARTIFACT_CONFLICT") {
      throw error;
    }
  }
  await gateway.uploadObject(DOCUMENT_PAGES_BUCKET, objectKey, bytes, "application/json");
}

function buildSourceContext(input: {
  logicalDocuments: Array<{
    sourceDocumentId?: string;
    logicalDocumentId?: string;
    filename?: string;
    customerLabel?: string;
  }>;
}): CanonicalStudySourceContext {
  const logicalDocuments = input.logicalDocuments
    .map((doc) => {
      const sourceDocumentId = doc.sourceDocumentId?.trim();
      if (!sourceDocumentId) {
        return null;
      }
      return {
        sourceDocumentId,
        logicalDocumentId: doc.logicalDocumentId,
        filename: doc.filename ?? doc.customerLabel,
      };
    })
    .filter((doc): doc is NonNullable<typeof doc> => doc !== null);

  return logicalDocuments.length > 0 ? { logicalDocuments } : {};
}

function firstEnvelope(
  envelopes: Map<string, ReaderDocumentExtractionEnvelope>,
): ReaderDocumentExtractionEnvelope | null {
  for (const envelope of envelopes.values()) {
    return envelope;
  }
  return null;
}

function emptyPackDiagnostics(
  partial: Pick<PackResolutionDiagnostics, "envelopePackId" | "envelopePackVersion" | "envelopePackContentSha256"> &
    Partial<PackResolutionDiagnostics>,
): PackResolutionDiagnostics {
  return {
    envelopePackId: partial.envelopePackId,
    envelopePackVersion: partial.envelopePackVersion,
    envelopePackContentSha256: partial.envelopePackContentSha256,
    candidatePaths: partial.candidatePaths ?? [],
    onDiskCurrentPackPath: partial.onDiskCurrentPackPath ?? null,
    onDiskCurrentPackContentSha256: partial.onDiskCurrentPackContentSha256 ?? null,
    expectedSnapshotPath:
      partial.expectedSnapshotPath ??
      proposalPackSnapshotPathForHash(partial.envelopePackContentSha256 || "0".repeat(64)),
    compatibilityErrors: partial.compatibilityErrors ?? [],
  };
}

function assertReaderEnvelopesSharePackMetadata(
  envelopes: Iterable<ReaderDocumentExtractionEnvelope>,
): { packId: string; packVersion: string; packContentSha256: string } {
  let packId: string | null = null;
  let packVersion: string | null = null;
  let packContentSha256: string | null = null;

  for (const envelope of envelopes) {
    const nextPackId = envelope.packId?.trim();
    const nextPackVersion = envelope.packVersion?.trim();
    const nextHash = envelope.packContentSha256?.trim().toLowerCase() ?? null;
    if (!nextPackId || !nextPackVersion || !nextHash) {
      throw new PackNotAvailableError(
        "Reader extraction envelopes are missing Domain Pack id, version, or content hash.",
        emptyPackDiagnostics({
          envelopePackId: nextPackId ?? "",
          envelopePackVersion: nextPackVersion ?? "",
          envelopePackContentSha256: nextHash ?? "",
          compatibilityErrors: [
            "Reader extraction envelopes are missing Domain Pack id, version, or content hash.",
          ],
        }),
      );
    }
    if (packId === null) {
      packId = nextPackId;
      packVersion = nextPackVersion;
      packContentSha256 = nextHash;
      continue;
    }
    if (packId !== nextPackId || packVersion !== nextPackVersion || packContentSha256 !== nextHash) {
      throw new PackNotAvailableError(
        "Reader extraction envelopes reference inconsistent Domain Pack metadata.",
        emptyPackDiagnostics({
          envelopePackId: packId ?? nextPackId,
          envelopePackVersion: packVersion ?? nextPackVersion,
          envelopePackContentSha256: packContentSha256 ?? nextHash,
          compatibilityErrors: [
            "Reader extraction envelopes reference inconsistent Domain Pack metadata.",
          ],
        }),
      );
    }
  }

  if (!packId || !packVersion || !packContentSha256) {
    throw new PackNotAvailableError(
      "Reader extraction envelopes did not include Domain Pack metadata.",
      emptyPackDiagnostics({
        envelopePackId: "",
        envelopePackVersion: "",
        envelopePackContentSha256: "",
        compatibilityErrors: [
          "Reader extraction envelopes did not include Domain Pack metadata.",
        ],
      }),
    );
  }

  return { packId, packVersion, packContentSha256 };
}

function stampDebugCanonicalStudyMetadata<T extends object>(
  artifact: T,
  debugContext: {
    structuralPack: ResolvedDebugCanonicalStudyDomainPack;
    canonicalRuleset: CanonicalStudyRulesetIdentity;
  },
): T & CanonicalStudyDebugArtifactMetadata {
  return {
    ...artifact,
    packApprovalLabel: CANONICAL_STUDY_DEBUG_PACK_APPROVAL,
    customerProReportsPermitted: false,
    readerPack: {
      packId: debugContext.structuralPack.pack.manifest.id,
      packVersion: debugContext.structuralPack.pack.manifest.version,
      packContentSha256: debugContext.structuralPack.contentSha256,
      packPath: debugContext.structuralPack.path,
      packSource: debugContext.structuralPack.source,
    },
    canonicalRuleset: debugContext.canonicalRuleset,
  };
}

function envelopeContainsExtractedFacts(envelope: ReaderDocumentExtractionEnvelope): boolean {
  if (envelope.status !== "SUCCEEDED" || !envelope.parsedModelJson) {
    return false;
  }
  const recordInstances = envelope.parsedModelJson.recordInstances;
  if (!Array.isArray(recordInstances) || recordInstances.length === 0) {
    return false;
  }
  return recordInstances.some(
    (record) => Array.isArray(record.fields) && record.fields.length > 0,
  );
}

export type RunDeterministicCanonicalStudyResult = {
  studyRunId: string;
  attemptId: string;
  foundation: CanonicalStudyFoundationArtifact & CanonicalStudyDebugArtifactMetadata;
  artifact: CanonicalStudyArtifact & CanonicalStudyDebugArtifactMetadata;
  foundationObjectKey: string;
  artifactObjectKey: string;
  readerPack: CanonicalStudyDebugReaderPackMetadata;
  canonicalRuleset: CanonicalStudyRulesetIdentity;
};

export async function runDeterministicCanonicalStudy(input: {
  caseId: string;
  studyRunId: string;
}): Promise<RunDeterministicCanonicalStudyResult> {
  const sessionUserId = requireSessionUserId(await getAuthenticatedUserId());
  const gateway = createSupabaseHiveGateway(await createServerSupabaseClient());

  const ownedCase = await new SupabaseCaseRepository(gateway, sessionUserId).getById(
    sessionUserId,
    input.caseId,
  );
  if (!ownedCase) {
    throw new CaseNotFoundError();
  }

  const run = await new SupabaseStudyRunRepository(gateway, sessionUserId).getByStudyRunId(
    input.studyRunId,
  );
  if (!run || run.caseId !== input.caseId) {
    throw new StudyRunNotFoundError();
  }

  const context = await new SupabaseStudyContextRepository(gateway, sessionUserId).getByStudyRunId(
    input.studyRunId,
  );

  const logicalDocuments =
    context?.structureMap?.logicalDocuments ?? context?.logicalDocuments ?? [];

  const preliminary = await loadReaderDocumentExtractionArtifacts({
    gateway,
    sessionUserId,
    caseId: input.caseId,
    studyRunId: input.studyRunId,
    logicalDocuments,
    fallbackSourceDocumentIds: [
      ...(context?.sourceDocuments
        .map((doc) => doc.sourceDocumentId)
        .filter((id): id is string => typeof id === "string" && id.trim().length > 0) ?? []),
    ],
  });

  const loaded = await loadReaderDocumentExtractionArtifacts({
    gateway,
    sessionUserId,
    caseId: input.caseId,
    studyRunId: input.studyRunId,
    logicalDocuments,
    fallbackSourceDocumentIds: [
      ...(context?.sourceDocuments
        .map((doc) => doc.sourceDocumentId)
        .filter((id): id is string => typeof id === "string" && id.trim().length > 0) ?? []),
      ...(preliminary.attemptManifest?.documents.map((doc) => doc.sourceDocumentId) ?? []),
      ...(preliminary.terminalArtifact?.succeededDocumentIds ?? []),
      ...(preliminary.terminalArtifact?.failedDocumentIds ?? []),
    ],
  });

  if (
    !loaded.attemptId ||
    loaded.envelopesBySourceDocumentId.size === 0 ||
    loaded.orderedSourceDocumentIds.length === 0
  ) {
    throw new RawExtractionNotFoundError();
  }

  const sampleEnvelope = firstEnvelope(loaded.envelopesBySourceDocumentId);
  if (!sampleEnvelope) {
    throw new RawExtractionNotFoundError();
  }
  const envelopePackMetadata = assertReaderEnvelopesSharePackMetadata(
    loaded.envelopesBySourceDocumentId.values(),
  );
  const structuralPack = resolveDebugCanonicalStudyDomainPack({
    envelopePackId: envelopePackMetadata.packId,
    envelopePackVersion: envelopePackMetadata.packVersion,
    envelopePackContentSha256: envelopePackMetadata.packContentSha256,
  });
  const canonicalRuleset = resolveCanonicalStudyRulesetIdentity();
  const debugContext = { structuralPack, canonicalRuleset };

  const sourceDocuments = await new SupabaseSourceDocumentRepository(
    gateway,
    sessionUserId,
  ).listByCase(sessionUserId, input.caseId);
  const shaBySourceId = new Map(
    sourceDocuments.map((doc) => [doc.id, doc.sha256] as const),
  );
  for (const ref of context?.sourceDocuments ?? []) {
    const sourceDocumentId = ref.sourceDocumentId?.trim();
    const sha256 = ref.sha256?.trim();
    if (sourceDocumentId && sha256) {
      shaBySourceId.set(sourceDocumentId, sha256);
    }
  }

  const foundationDocuments = [];
  for (const sourceDocumentId of loaded.orderedSourceDocumentIds) {
    const envelope = loaded.envelopesBySourceDocumentId.get(sourceDocumentId);
    if (!envelope) {
      continue;
    }
    const sha256 = shaBySourceId.get(sourceDocumentId);
    let documentPages = null;
    if (sha256) {
      try {
        const bytes = await gateway.downloadObject(
          DOCUMENT_PAGES_BUCKET,
          documentPagesStoragePath(sessionUserId, sha256),
        );
        documentPages = bindDocumentPagesToSourceDocumentId(
          assertTrustedDocumentPagesPayload(bytes, sha256),
          sourceDocumentId,
        );
      } catch (error) {
        if (error instanceof TrustedDocumentPagesError) {
          documentPages = null;
        } else if (error instanceof Error && /not found|NOT_FOUND/i.test(error.message)) {
          documentPages = null;
        } else {
          throw error;
        }
      }
    }
    foundationDocuments.push({
      sourceDocumentId,
      envelope,
      documentPages,
    });
  }

  if (foundationDocuments.length === 0) {
    throw new RawExtractionNotFoundError();
  }

  const affectedDocumentIds = foundationDocuments
    .filter(
      (doc) => envelopeContainsExtractedFacts(doc.envelope) && doc.documentPages === null,
    )
    .map((doc) => doc.sourceDocumentId)
    .sort((a, b) => a.localeCompare(b));
  if (affectedDocumentIds.length > 0) {
    throw new SourcePagesUnavailableError(affectedDocumentIds);
  }

  const createdAt = new Date().toISOString();
  const foundation = stampDebugCanonicalStudyMetadata(
    buildCanonicalStudyFoundation({
      pack: structuralPack.pack,
      packContentSha256: structuralPack.contentSha256,
      caseId: input.caseId,
      createdAt,
      documents: foundationDocuments,
    }),
    debugContext,
  );

  const sourceContext = buildSourceContext({
    logicalDocuments: logicalDocuments.map((doc) => ({
      sourceDocumentId: doc.sourceDocumentId,
      logicalDocumentId: doc.id,
      filename: doc.title,
    })),
  });

  const artifact = stampDebugCanonicalStudyMetadata(
    buildCanonicalStudy({
      pack: structuralPack.pack,
      packContentSha256: structuralPack.contentSha256,
      foundation,
      sourceContext,
      createdAt,
    }),
    debugContext,
  );

  const attemptId = loaded.attemptId;
  const foundationObjectKey = canonicalStudyFoundationArtifactPath(
    sessionUserId,
    input.studyRunId,
    attemptId,
  );
  const artifactObjectKey = canonicalStudyArtifactPath(sessionUserId, input.studyRunId, attemptId);

  await uploadIfAbsent(gateway, foundationObjectKey, foundation);
  await uploadIfAbsent(gateway, artifactObjectKey, artifact);

  return {
    studyRunId: input.studyRunId,
    attemptId,
    foundation,
    artifact,
    foundationObjectKey,
    artifactObjectKey,
    readerPack: {
      packId: structuralPack.pack.manifest.id,
      packVersion: structuralPack.pack.manifest.version,
      packContentSha256: structuralPack.contentSha256,
      packPath: structuralPack.path,
      packSource: structuralPack.source,
    },
    canonicalRuleset,
  };
}

export async function loadDeterministicCanonicalStudyArtifact(input: {
  caseId: string;
  studyRunId: string;
}): Promise<CanonicalStudyArtifact & CanonicalStudyDebugArtifactMetadata> {
  const sessionUserId = requireSessionUserId(await getAuthenticatedUserId());
  const gateway = createSupabaseHiveGateway(await createServerSupabaseClient());

  const ownedCase = await new SupabaseCaseRepository(gateway, sessionUserId).getById(
    sessionUserId,
    input.caseId,
  );
  if (!ownedCase) {
    throw new CaseNotFoundError();
  }

  const run = await new SupabaseStudyRunRepository(gateway, sessionUserId).getByStudyRunId(
    input.studyRunId,
  );
  if (!run || run.caseId !== input.caseId) {
    throw new StudyRunNotFoundError();
  }

  const context = await new SupabaseStudyContextRepository(gateway, sessionUserId).getByStudyRunId(
    input.studyRunId,
  );
  const logicalDocuments =
    context?.structureMap?.logicalDocuments ?? context?.logicalDocuments ?? [];

  const extraction = await loadReaderDocumentExtractionArtifacts({
    gateway,
    sessionUserId,
    caseId: input.caseId,
    studyRunId: input.studyRunId,
    logicalDocuments,
    fallbackSourceDocumentIds: [
      ...(context?.sourceDocuments
        .map((doc) => doc.sourceDocumentId)
        .filter((id): id is string => typeof id === "string" && id.trim().length > 0) ?? []),
    ],
  });

  const attemptId = extraction.attemptId;
  if (!attemptId) {
    throw new CanonicalStudyArtifactsNotFoundError();
  }

  const artifactObjectKey = canonicalStudyArtifactPath(
    sessionUserId,
    input.studyRunId,
    attemptId,
  );
  try {
    const bytes = await gateway.downloadObject(DOCUMENT_PAGES_BUCKET, artifactObjectKey);
    return JSON.parse(new TextDecoder().decode(bytes)) as CanonicalStudyArtifact &
      CanonicalStudyDebugArtifactMetadata;
  } catch {
    throw new CanonicalStudyArtifactsNotFoundError();
  }
}

export { PackNotAvailableError };
