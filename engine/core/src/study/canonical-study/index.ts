import type { ProposalDomainPack } from "@hiveforyou/domain-pack";
import type { CanonicalStudyArtifact } from "@hiveforyou/shared/canonical-study-artifact";
import {
  CANONICAL_STUDY_ARTIFACT_SCHEMA_VERSION,
  type CanonicalStudySourceContext,
} from "@hiveforyou/shared/canonical-study-artifact";
import type { CanonicalStudyFoundationArtifact } from "@hiveforyou/shared/canonical-study-foundation";
import { hashCanonicalStudyFoundationBody } from "../canonical-study-foundation/hash-body.js";

import { buildSeries } from "./build-series.js";
import { composeOperativeViews } from "./compose-operative-views.js";
import { evaluateInsightChecks } from "./evaluate-insight-checks.js";
import { evaluateRequirements } from "./evaluate-requirements.js";
import { hashCanonicalStudyBody } from "./hash-body.js";
import { buildIndexedFoundation } from "./indexed-foundation.js";
import { labelRelations } from "./label-relations.js";
import { resolveIdentity } from "./resolve-identity.js";

export type BuildCanonicalStudyInput = {
  pack: ProposalDomainPack;
  packContentSha256: string;
  foundation: CanonicalStudyFoundationArtifact;
  sourceContext?: CanonicalStudySourceContext;
  createdAt?: string;
};

function validatePackFoundationConsistency(input: BuildCanonicalStudyInput): void {
  if (input.pack.manifest.id !== input.foundation.packId) {
    throw new Error("CANONICAL_STUDY_PACK_MISMATCH:packId");
  }
  if (input.pack.manifest.version !== input.foundation.packVersion) {
    throw new Error("CANONICAL_STUDY_PACK_MISMATCH:packVersion");
  }
  if (input.packContentSha256.toLowerCase() !== input.foundation.packContentSha256.toLowerCase()) {
    throw new Error("CANONICAL_STUDY_PACK_MISMATCH:packContentSha256");
  }
  const recomputed = hashCanonicalStudyFoundationBody({
    schemaVersion: input.foundation.schemaVersion,
    packId: input.foundation.packId,
    packVersion: input.foundation.packVersion,
    packContentSha256: input.foundation.packContentSha256,
    studyRunId: input.foundation.studyRunId,
    attemptId: input.foundation.attemptId,
    caseId: input.foundation.caseId,
    counts: input.foundation.counts,
    documents: input.foundation.documents,
    groupedRecords: input.foundation.groupedRecords,
    verifiedFields: input.foundation.verifiedFields,
    rejectedFields: input.foundation.rejectedFields,
    unresolvedFields: input.foundation.unresolvedFields,
    unresolvedItems: input.foundation.unresolvedItems,
  });
  if (recomputed !== input.foundation.contentSha256) {
    throw new Error("CANONICAL_STUDY_FOUNDATION_HASH_MISMATCH");
  }
}

export function buildCanonicalStudy(input: BuildCanonicalStudyInput): CanonicalStudyArtifact {
  validatePackFoundationConsistency(input);

  const sourceContext: CanonicalStudySourceContext = input.sourceContext ?? {};
  const indexed = buildIndexedFoundation({
    pack: input.pack,
    foundation: input.foundation,
    sourceContext,
  });

  const { entities, possiblySameLinks, orphans, orphanItems } = resolveIdentity(indexed);
  const { operativeViews, documentLineage } = composeOperativeViews({ indexed, entities });
  const { relations, unresolvedComparisons } = labelRelations({ indexed, entities });
  const series = buildSeries({ indexed, entities });
  const requirements = evaluateRequirements({ indexed, operativeViews });
  const flags = evaluateInsightChecks({ indexed, operativeViews, series });

  const body = {
    schemaVersion: CANONICAL_STUDY_ARTIFACT_SCHEMA_VERSION,
    packId: input.foundation.packId,
    packVersion: input.foundation.packVersion,
    packContentSha256: input.foundation.packContentSha256,
    foundationContentSha256: input.foundation.contentSha256,
    studyRunId: input.foundation.studyRunId,
    attemptId: input.foundation.attemptId,
    caseId: input.foundation.caseId,
    documents: input.foundation.documents.map((doc) => ({
      sourceDocumentId: doc.sourceDocumentId,
      documentTypeId: doc.documentTypeId,
      sortRank: doc.sortRank,
      verifiedOrderingDate: doc.verifiedOrderingDate,
    })),
    documentLineage,
    entities,
    operativeViews,
    relations,
    unresolvedComparisons,
    series,
    requirements,
    flags,
    possiblySameLinks,
    unresolvedItems: [...input.foundation.unresolvedItems, ...orphanItems].sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
    rejectedFields: input.foundation.rejectedFields,
    orphans,
    counts: {
      entities: entities.length,
      entityIdentityUnresolved: entities.filter((entity) => entity.status === "identity_unresolved").length,
      operativeViews: operativeViews.length,
      relations: relations.length,
      unresolvedComparisons: unresolvedComparisons.length,
      series: series.length,
      requirements: requirements.length,
      flags: flags.length,
      possiblySameLinks: possiblySameLinks.length,
      unresolvedItems: input.foundation.unresolvedItems.length + orphanItems.length,
      rejectedFields: input.foundation.rejectedFields.length,
      orphans: orphans.length,
    },
  };

  const contentSha256 = hashCanonicalStudyBody(body);
  return {
    ...body,
    createdAt: input.createdAt ?? new Date(0).toISOString(),
    contentSha256,
  };
}

export { buildIndexedFoundation } from "./indexed-foundation.js";
export { resolveIdentity } from "./resolve-identity.js";
export { composeOperativeViews } from "./compose-operative-views.js";
export { labelRelations } from "./label-relations.js";
export { buildSeries } from "./build-series.js";
export { evaluateRequirements } from "./evaluate-requirements.js";
export { evaluateInsightChecks } from "./evaluate-insight-checks.js";
