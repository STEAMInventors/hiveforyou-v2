import { createHash } from "node:crypto";

import {
  assertTrustedDocumentPagesPayload,
  bindDocumentPagesToSourceDocumentId,
  TrustedDocumentPagesError,
} from "../document/trusted-document-pages.js";
import type { CanonicalStudySourceContext } from "@hiveforyou/shared/canonical-study-artifact";
import type { CanonicalStudyArtifact } from "@hiveforyou/shared/canonical-study-artifact";
import type { CanonicalStudyFoundationArtifact } from "@hiveforyou/shared/canonical-study-foundation";
import {
  canonicalStudyArtifactPath,
  canonicalStudyFoundationArtifactPath,
  documentPagesStoragePath,
} from "@hiveforyou/shared/hive-artifact-paths";
import {
  canonicalStudyRunManifestPath,
  type CanonicalStudyRunManifest,
} from "@hiveforyou/shared/canonical-study-run-manifest";
import type { ReaderDocumentExtractionEnvelope } from "@hiveforyou/shared/reader-document-extraction";
import type { StructureMapLogicalDocument } from "@hiveforyou/shared/discover/structure-map";

import {
  buildCanonicalStudy,
  resolveCanonicalStudyRulesetIdentity,
  type CanonicalStudyRulesetIdentity,
} from "./canonical-study/index.js";
import { buildCanonicalStudyFoundation } from "./canonical-study-foundation/index.js";
import {
  type DeterministicCanonicalStudyObjectStorage,
  loadReaderDocumentExtractionArtifacts,
} from "./load-reader-document-extraction-artifacts.js";
import {
  applyCanonicalStudyInterpretationIfCompatible,
} from "./resolve-canonical-study-interpretation.js";
import {
  CANONICAL_STUDY_DEBUG_PACK_APPROVAL,
  PackNotAvailableError,
  proposalPackSnapshotPathForHash,
  resolveDebugCanonicalStudyDomainPack,
  type PackResolutionDiagnostics,
  type ResolvedDebugCanonicalStudyDomainPack,
} from "./resolve-approved-proposal-domain-pack.js";
import type { SourceDocumentRepository } from "../persistence/source-document-repository.js";
import type { StudyArtifactRepository } from "./study-artifact-repository.js";
import type { StudyContextRepository } from "./repositories.js";

const DOCUMENT_PAGES_BUCKET = "document-pages";

export class RawExtractionNotFoundError extends Error {
  readonly code = "RAW_EXTRACTION_NOT_FOUND";

  constructor() {
    super("Persisted reader document extractions were not found for this study run.");
    this.name = "RawExtractionNotFoundError";
  }
}

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

export class DeterministicCanonicalStudyConflictError extends Error {
  readonly code = "CANONICAL_STUDY_ARTIFACT_CONFLICT";

  constructor() {
    super("Canonical study artifacts already exist with different content.");
    this.name = "DeterministicCanonicalStudyConflictError";
  }
}

export type DeterministicCanonicalStudyWritableStorage = DeterministicCanonicalStudyObjectStorage & {
  uploadObject(
    bucket: string,
    path: string,
    bytes: Uint8Array,
    contentType?: string,
  ): Promise<void>;
};

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
  storage: DeterministicCanonicalStudyWritableStorage,
  objectKey: string,
  payload: unknown,
): Promise<void> {
  const contentHash = sha256Json(payload);
  try {
    const existingBytes = await storage.downloadObject(DOCUMENT_PAGES_BUCKET, objectKey);
    const existing = JSON.parse(new TextDecoder().decode(existingBytes)) as unknown;
    if (sha256Json(existing) !== contentHash) {
      throw new DeterministicCanonicalStudyConflictError();
    }
    return;
  } catch (error) {
    if (error instanceof DeterministicCanonicalStudyConflictError) {
      throw error;
    }
  }
  const bytes = new TextEncoder().encode(JSON.stringify(payload, null, 2));
  await storage.uploadObject(DOCUMENT_PAGES_BUCKET, objectKey, bytes, "application/json");
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
  partial: Pick<
    PackResolutionDiagnostics,
    "envelopePackId" | "envelopePackVersion" | "envelopePackContentSha256"
  > &
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
): { packId: string; packVersion: string; packContentSha256: string; domainId: string } {
  let packId: string | null = null;
  let packVersion: string | null = null;
  let packContentSha256: string | null = null;
  let domainId: string | null = null;

  for (const envelope of envelopes) {
    const nextPackId = envelope.packId?.trim();
    const nextPackVersion = envelope.packVersion?.trim();
    const nextHash = envelope.packContentSha256?.trim().toLowerCase() ?? null;
    const nextDomainId = envelope.domainId?.trim() ?? null;
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
      domainId = nextDomainId;
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

  return { packId, packVersion, packContentSha256, domainId: domainId ?? "" };
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
  runManifest: CanonicalStudyRunManifest;
};

export async function runDeterministicCanonicalStudy(input: {
  userId: string;
  caseId: string;
  studyRunId: string;
  storage: DeterministicCanonicalStudyWritableStorage;
  studyArtifactRepo: StudyArtifactRepository;
  contextRepo: StudyContextRepository;
  sourceDocuments: SourceDocumentRepository;
  logicalDocuments?: StructureMapLogicalDocument[];
  env?: Record<string, string | undefined>;
  now?: () => string;
}): Promise<RunDeterministicCanonicalStudyResult> {
  const env = input.env ?? process.env;
  const now = input.now ?? (() => new Date().toISOString());

  const context = await input.contextRepo.getByStudyRunId(input.studyRunId);
  const logicalDocuments =
    input.logicalDocuments ??
    context?.structureMap?.logicalDocuments ??
    context?.logicalDocuments ??
    [];

  const preliminary = await loadReaderDocumentExtractionArtifacts({
    storage: input.storage,
    studyArtifactRepo: input.studyArtifactRepo,
    userId: input.userId,
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
    storage: input.storage,
    studyArtifactRepo: input.studyArtifactRepo,
    userId: input.userId,
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
    env,
  });
  const interpretation = applyCanonicalStudyInterpretationIfCompatible({
    readerPack: structuralPack.pack,
    readerPackContentSha256: structuralPack.contentSha256,
    domainId: envelopePackMetadata.domainId || context?.domainId,
    env,
  });
  const canonicalRuleset = resolveCanonicalStudyRulesetIdentity();
  const debugContext = { structuralPack, canonicalRuleset };

  const sourceDocumentRows = await input.sourceDocuments.listByCase(input.userId, input.caseId);
  const shaBySourceId = new Map(
    sourceDocumentRows.map((doc) => [doc.id, doc.sha256] as const),
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
        const bytes = await input.storage.downloadObject(
          DOCUMENT_PAGES_BUCKET,
          documentPagesStoragePath(input.userId, sha256),
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

  const createdAt = now();
  const foundation = stampDebugCanonicalStudyMetadata(
    buildCanonicalStudyFoundation({
      pack: interpretation.studyPack,
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
      pack: interpretation.studyPack,
      packContentSha256: structuralPack.contentSha256,
      interpretationRulesetId: interpretation.interpretationRulesetId,
      interpretationRulesetContentSha256: interpretation.interpretationRulesetContentSha256,
      foundation,
      sourceContext,
      createdAt,
    }),
    debugContext,
  );

  const attemptId = loaded.attemptId;
  const foundationObjectKey = canonicalStudyFoundationArtifactPath(
    input.userId,
    input.studyRunId,
    attemptId,
  );
  const artifactObjectKey = canonicalStudyArtifactPath(input.userId, input.studyRunId, attemptId);

  await uploadIfAbsent(input.storage, foundationObjectKey, foundation);
  await uploadIfAbsent(input.storage, artifactObjectKey, artifact);

  const inputSourceDocumentIds = loaded.orderedSourceDocumentIds.filter((id) =>
    loaded.envelopesBySourceDocumentId.has(id),
  );

  const runManifest: CanonicalStudyRunManifest = {
    schemaVersion: "hive.canonical-study-run-manifest/1",
    studyRunId: input.studyRunId,
    caseId: input.caseId,
    latestAttemptId: attemptId,
    inputSourceDocumentIds,
    readerPackId: structuralPack.pack.manifest.id,
    readerPackVersion: structuralPack.pack.manifest.version,
    readerPackContentSha256: structuralPack.contentSha256,
    interpretationRulesetId: interpretation.interpretationRulesetId,
    interpretationRulesetContentSha256: interpretation.interpretationRulesetContentSha256,
    canonicalRulesetId: canonicalRuleset.rulesetId,
    canonicalRulesetContentSha256: canonicalRuleset.rulesetContentSha256,
    foundationObjectKey,
    artifactObjectKey,
    artifactContentSha256: artifact.contentSha256,
    status: "SUCCEEDED",
    updatedAt: createdAt,
  };

  await uploadIfAbsent(
    input.storage,
    canonicalStudyRunManifestPath(input.userId, input.studyRunId),
    runManifest,
  );

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
    runManifest,
  };
}

export async function loadDeterministicCanonicalStudyArtifact(input: {
  userId: string;
  studyRunId: string;
  storage: DeterministicCanonicalStudyObjectStorage;
  studyArtifactRepo: StudyArtifactRepository;
  contextRepo: StudyContextRepository;
}): Promise<CanonicalStudyArtifact & CanonicalStudyDebugArtifactMetadata> {
  const context = await input.contextRepo.getByStudyRunId(input.studyRunId);
  const logicalDocuments =
    context?.structureMap?.logicalDocuments ?? context?.logicalDocuments ?? [];

  const extraction = await loadReaderDocumentExtractionArtifacts({
    storage: input.storage,
    studyArtifactRepo: input.studyArtifactRepo,
    userId: input.userId,
    caseId: context?.caseId ?? "",
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

  const artifactObjectKey = canonicalStudyArtifactPath(input.userId, input.studyRunId, attemptId);
  try {
    const bytes = await input.storage.downloadObject(DOCUMENT_PAGES_BUCKET, artifactObjectKey);
    return JSON.parse(new TextDecoder().decode(bytes)) as CanonicalStudyArtifact &
      CanonicalStudyDebugArtifactMetadata;
  } catch {
    throw new CanonicalStudyArtifactsNotFoundError();
  }
}
