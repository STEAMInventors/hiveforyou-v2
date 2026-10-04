import type { CanonicalStudyContext } from "@hiveforyou/shared/canonical-study";
import type { StructureMap } from "@hiveforyou/shared/discover";

function scopedLogicalIds(context: CanonicalStudyContext): Set<string> {
  return new Set(context.logicalDocuments.map((doc) => doc.id));
}

function filterStructureMapSlice(
  map: StructureMap,
  logicalIds: Set<string>,
  logicalDocuments: CanonicalStudyContext["logicalDocuments"],
): Record<string, unknown> {
  const relationships = map.relationships.filter(
    (rel) =>
      logicalIds.has(rel.fromLogicalDocumentId) &&
      logicalIds.has(rel.toLogicalDocumentId),
  );
  const chronology = map.chronology.filter((entry) =>
    logicalIds.has(entry.logicalDocumentId),
  );
  const domainGroups = map.domainGroups?.map((group) => ({
    ...group,
    logicalDocumentIds: group.logicalDocumentIds.filter((id) => logicalIds.has(id)),
    documentCategories: group.documentCategories?.map((category) => ({
      ...category,
      logicalDocumentIds: category.logicalDocumentIds.filter((id) =>
        logicalIds.has(id),
      ),
    })),
  }));

  return {
    schemaVersion: map.schemaVersion,
    domainResolution: map.domainResolution,
    domainGroups,
    logicalDocuments,
    relationships,
    chronology,
    discoveryAnswers: map.discoveryAnswers,
    unresolved: map.unresolved,
    completeness: map.completeness,
    sourceDocuments: map.sourceDocuments,
  };
}

/**
 * Engine 1 + Structure Map intelligence for the model (ids and classifications only — no file bytes).
 */
export function serializeEngine2StructureContext(
  context: CanonicalStudyContext,
): Record<string, unknown> {
  const discovery = {
    domainLabel: context.engine1Result.domainLabel,
    domainResolutionStatus: context.engine1Result.domainResolutionStatus,
    groups: context.engine1Result.groups,
    documents: context.engine1Result.documents.map((doc) => ({
      id: doc.id,
      stagedDocumentId: doc.stagedDocumentId ?? null,
      documentType: doc.documentType,
      title: doc.title,
      documentDate: doc.documentDate ?? null,
      originalFilename: doc.originalFilename,
      familyRole: doc.familyRole,
      groupId: doc.groupId,
      recognitionStatus: doc.recognitionStatus,
      sequenceOrder: doc.sequenceOrder ?? null,
    })),
    relationships: context.engine1Result.relationships,
    missingDocuments: context.engine1Result.missingDocuments,
  };

  const logicalIds = scopedLogicalIds(context);
  const structureMap =
    context.structureMap && logicalIds.size > 0
      ? filterStructureMapSlice(context.structureMap, logicalIds, context.logicalDocuments)
      : context.structureMap
        ? filterStructureMapSlice(
            context.structureMap,
            new Set(context.structureMap.logicalDocuments.map((doc) => doc.id)),
            context.logicalDocuments,
          )
        : null;

  return {
    schemaVersion: "engine2-structure-context/1",
    domainId: context.domainId,
    discovery,
    structureMap,
  };
}
