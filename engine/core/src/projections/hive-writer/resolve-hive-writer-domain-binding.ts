import type { ProposalDomainPack } from "@hiveforyou/domain-pack";
import {
  computeProposalPackContentSha256,
  validateProposalDomainPack,
} from "@hiveforyou/domain-pack/pack-driven-reader";
import { readFileSync } from "node:fs";
import {
  CANONICAL_STUDY_ARTIFACT_SCHEMA_VERSION,
  type CanonicalStudyArtifact,
} from "@hiveforyou/shared/canonical-study-artifact";
import type {
  CanonicalStudyReportAudience,
  CanonicalStudyReportProjection,
} from "@hiveforyou/shared/canonical-study-report-projection";
import type { HiveWriterDomainBinding } from "@hiveforyou/shared/hive-writer-proposal";
import {
  getDomainPackByDomainId,
  listRoutableDomainPackManifests,
} from "@hiveforyou/domain-packs";

import {
  proposalPackSnapshotPathForIdentity,
  ReaderProposalPackBindingError,
  resolveProposalPackIdentityFromContentHash,
  type ProposalPackIdentity,
} from "../../study/resolve-proposal-pack-identity.js";
import { hashCanonicalStudyReportProjection } from "./hash-canonical-study-report-projection.js";

export class HiveWriterDomainBindingError extends Error {
  readonly code = "WRITER_DOMAIN_BINDING_UNRESOLVED" as const;

  constructor(message: string) {
    super(message);
    this.name = "HiveWriterDomainBindingError";
  }
}

const SHA256_HEX = /^[a-f0-9]{64}$/;

/** Test fixture pack (not registered in domain-packs registry). */
function resolveSyntheticTestDomainId(artifact: CanonicalStudyArtifact): string | null {
  if (artifact.packId === "synthetic-test" && artifact.packVersion === "0.0.1") {
    return "synthetic";
  }
  return null;
}

function packIdMatchesRegisteredPack(
  artifactPackId: string,
  manifestId: string,
  discover?: { domainId: string; domainPackId: string },
): boolean {
  return (
    artifactPackId === manifestId ||
    artifactPackId === discover?.domainPackId ||
    artifactPackId === discover?.domainId
  );
}

function resolveRegisteredDomainIdsForPackId(packId: string): string[] {
  const domainIds = new Set<string>();
  for (const manifest of listRoutableDomainPackManifests()) {
    const pack = getDomainPackByDomainId(manifest.id);
    if (packIdMatchesRegisteredPack(packId, manifest.id, pack?.discover)) {
      domainIds.add(manifest.id);
    }
  }
  return [...domainIds];
}

function verifyImmutableProposalPackSnapshotFile(
  identity: ProposalPackIdentity,
  env: Record<string, string | undefined>,
): void {
  const path = proposalPackSnapshotPathForIdentity(identity, env);
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new HiveWriterDomainBindingError(
      `Verified proposal pack snapshot file is missing or unreadable: ${path}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new HiveWriterDomainBindingError("Verified proposal pack snapshot file is corrupt JSON.");
  }
  const validation = validateProposalDomainPack(parsed as ProposalDomainPack);
  if (!validation.valid) {
    throw new HiveWriterDomainBindingError(
      "Verified proposal pack snapshot failed structural validation.",
    );
  }
  const pack = parsed as ProposalDomainPack;
  const contentSha256 = computeProposalPackContentSha256(pack).toLowerCase();
  if (contentSha256 !== identity.packContentSha256) {
    throw new HiveWriterDomainBindingError(
      "Verified proposal pack snapshot content hash does not match the persisted study hash.",
    );
  }
  if (pack.manifest.id !== identity.packId || pack.manifest.version !== identity.packVersion) {
    throw new HiveWriterDomainBindingError(
      "Verified proposal pack snapshot manifest identity does not match the persisted study.",
    );
  }
}

function resolveVerifiedPackIdentity(input: {
  artifact: CanonicalStudyArtifact;
  env: Record<string, string | undefined>;
}): { domainId: string; identity: ProposalPackIdentity } {
  const syntheticDomainId = resolveSyntheticTestDomainId(input.artifact);
  if (syntheticDomainId) {
    return {
      domainId: syntheticDomainId,
      identity: {
        packId: input.artifact.packId,
        packVersion: input.artifact.packVersion,
        packContentSha256: input.artifact.packContentSha256.toLowerCase(),
      },
    };
  }

  const domainIds = resolveRegisteredDomainIdsForPackId(input.artifact.packId);
  if (domainIds.length === 0) {
    throw new HiveWriterDomainBindingError(
      "No routable domain binding could be resolved from persisted pack metadata.",
    );
  }
  if (domainIds.length > 1) {
    throw new HiveWriterDomainBindingError(
      "Ambiguous domain binding for persisted pack id; cannot bind Writer.",
    );
  }
  const domainId = domainIds[0]!;

  let identity: ProposalPackIdentity;
  try {
    identity = resolveProposalPackIdentityFromContentHash({
      domainId,
      packContentSha256: input.artifact.packContentSha256,
      env: input.env,
    });
  } catch (error) {
    if (error instanceof ReaderProposalPackBindingError) {
      throw new HiveWriterDomainBindingError(error.message);
    }
    throw error;
  }

  if (
    identity.packId !== input.artifact.packId ||
    identity.packVersion !== input.artifact.packVersion
  ) {
    throw new HiveWriterDomainBindingError(
      "Persisted canonical study pack id/version does not match the verified snapshot manifest entry.",
    );
  }

  return { domainId, identity };
}

function buildDomainBinding(input: {
  domainId: string;
  artifact: CanonicalStudyArtifact;
  projection: CanonicalStudyReportProjection;
  identity: ProposalPackIdentity;
}): HiveWriterDomainBinding {
  return {
    domainId: input.domainId,
    packId: input.identity.packId,
    packVersion: input.identity.packVersion,
    packContentSha256: input.identity.packContentSha256.toLowerCase(),
    sourceCanonicalSchemaVersion: CANONICAL_STUDY_ARTIFACT_SCHEMA_VERSION,
    sourceCanonicalArtifactSha256: input.artifact.contentSha256.toLowerCase(),
    reportProjectionSchemaVersion: input.projection.schemaVersion,
    reportProjectionContentSha256: hashCanonicalStudyReportProjection(input.projection),
  };
}

function assertArtifactProjectionAlignment(input: {
  artifact: CanonicalStudyArtifact;
  projection: CanonicalStudyReportProjection;
}): void {
  const { artifact, projection } = input;
  if (projection.caseId !== artifact.caseId || projection.studyRunId !== artifact.studyRunId) {
    throw new HiveWriterDomainBindingError("Projection case/run identity does not match artifact.");
  }
  if (projection.packId !== artifact.packId || projection.packVersion !== artifact.packVersion) {
    throw new HiveWriterDomainBindingError("Projection pack identity does not match artifact.");
  }
  if (projection.sourceArtifactContentSha256 !== artifact.contentSha256) {
    throw new HiveWriterDomainBindingError("Projection source artifact hash mismatch.");
  }
}

export function assertHiveWriterPersistedStudyRequest(input: {
  studyRunId: string;
  audience: CanonicalStudyReportAudience;
  artifact: CanonicalStudyArtifact;
  projection: CanonicalStudyReportProjection;
}): void {
  const studyRunId = input.studyRunId.trim();
  if (!studyRunId) {
    throw new HiveWriterDomainBindingError("studyRunId is required.");
  }
  if (input.artifact.studyRunId !== studyRunId || input.projection.studyRunId !== studyRunId) {
    throw new HiveWriterDomainBindingError(
      "Persisted canonical study does not match the requested studyRunId.",
    );
  }
  if (input.projection.audience !== input.audience) {
    throw new HiveWriterDomainBindingError(
      "Report projection audience does not match the requested audience.",
    );
  }
}

export function resolveHiveWriterDomainBinding(input: {
  artifact: CanonicalStudyArtifact;
  projection: CanonicalStudyReportProjection;
  env?: Record<string, string | undefined>;
}): HiveWriterDomainBinding {
  const env = input.env ?? process.env;
  assertArtifactProjectionAlignment(input);

  if (!SHA256_HEX.test(input.artifact.packContentSha256)) {
    throw new HiveWriterDomainBindingError("Artifact pack content hash is missing or invalid.");
  }

  const syntheticDomainId = resolveSyntheticTestDomainId(input.artifact);
  const { domainId, identity } = resolveVerifiedPackIdentity({
    artifact: input.artifact,
    env,
  });

  if (!syntheticDomainId) {
    verifyImmutableProposalPackSnapshotFile(identity, env);
  }

  return buildDomainBinding({
    domainId,
    artifact: input.artifact,
    projection: input.projection,
    identity,
  });
}

/** Binds Writer domain identity from a persisted canonical study loaded for studyRunId + audience. */
export function resolveHiveWriterDomainBindingForPersistedStudy(input: {
  studyRunId: string;
  audience: CanonicalStudyReportAudience;
  artifact: CanonicalStudyArtifact;
  projection: CanonicalStudyReportProjection;
  env?: Record<string, string | undefined>;
}): HiveWriterDomainBinding {
  assertHiveWriterPersistedStudyRequest({
    studyRunId: input.studyRunId,
    audience: input.audience,
    artifact: input.artifact,
    projection: input.projection,
  });
  return resolveHiveWriterDomainBinding({
    artifact: input.artifact,
    projection: input.projection,
    env: input.env,
  });
}
