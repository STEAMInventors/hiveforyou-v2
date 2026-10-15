import {
  CANONICAL_STUDY_ARTIFACT_SCHEMA_VERSION,
  type CanonicalStudyArtifact,
} from "@hiveforyou/shared/canonical-study-artifact";
import type { CanonicalStudyReportProjection } from "@hiveforyou/shared/canonical-study-report-projection";
import type { HiveWriterDomainBinding } from "@hiveforyou/shared/hive-writer-proposal";
import {
  getDomainPackByDomainId,
  listRoutableDomainPackManifests,
} from "@hiveforyou/domain-packs";

import { hashCanonicalStudyReportProjection } from "./hash-canonical-study-report-projection.js";

export class HiveWriterDomainBindingError extends Error {
  readonly code = "WRITER_DOMAIN_BINDING_UNRESOLVED" as const;

  constructor(message: string) {
    super(message);
    this.name = "HiveWriterDomainBindingError";
  }
}

function resolveRegisteredDomainId(artifact: CanonicalStudyArtifact): string | null {
  for (const manifest of listRoutableDomainPackManifests()) {
    const pack = getDomainPackByDomainId(manifest.id);
    const discover = pack?.discover;
    if (!discover) {
      continue;
    }
    const idMatches =
      artifact.packId === discover.domainPackId ||
      artifact.packId === discover.domainId ||
      artifact.packId === manifest.id;
    const versionMatches =
      artifact.packVersion === discover.domainPackVersion ||
      artifact.packVersion === manifest.version;
    if (idMatches && versionMatches) {
      return discover.domainId;
    }
  }
  return null;
}

/** Test fixture pack (not registered in domain-packs registry). */
function resolveSyntheticTestDomainId(artifact: CanonicalStudyArtifact): string | null {
  if (artifact.packId === "synthetic-test" && artifact.packVersion === "0.0.1") {
    return "synthetic";
  }
  return null;
}

function buildDomainBinding(input: {
  domainId: string;
  artifact: CanonicalStudyArtifact;
  projection: CanonicalStudyReportProjection;
}): HiveWriterDomainBinding {
  return {
    domainId: input.domainId,
    packId: input.artifact.packId,
    packVersion: input.artifact.packVersion,
    packContentSha256: input.artifact.packContentSha256.toLowerCase(),
    sourceCanonicalSchemaVersion: CANONICAL_STUDY_ARTIFACT_SCHEMA_VERSION,
    sourceCanonicalArtifactSha256: input.artifact.contentSha256.toLowerCase(),
    reportProjectionSchemaVersion: input.projection.schemaVersion,
    reportProjectionContentSha256: hashCanonicalStudyReportProjection(input.projection),
  };
}

export function resolveHiveWriterDomainBinding(input: {
  artifact: CanonicalStudyArtifact;
  projection: CanonicalStudyReportProjection;
}): HiveWriterDomainBinding {
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
  if (!/^[a-f0-9]{64}$/.test(artifact.packContentSha256)) {
    throw new HiveWriterDomainBindingError("Artifact pack content hash is missing or invalid.");
  }

  const domainId =
    resolveSyntheticTestDomainId(artifact) ?? resolveRegisteredDomainId(artifact);
  if (!domainId) {
    throw new HiveWriterDomainBindingError(
      "No domain binding could be resolved from persisted pack metadata.",
    );
  }

  return buildDomainBinding({ domainId, artifact, projection });
}
