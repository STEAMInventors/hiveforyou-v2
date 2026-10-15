import type {
  CanonicalStudyEntity,
  CanonicalStudyRelation,
  CanonicalStudyRelationCluster,
} from "@hiveforyou/shared/canonical-study-artifact";

import { stableId } from "./stable-id.js";

export type CompactRelationsResult = {
  relations: CanonicalStudyRelation[];
  relationClusters: CanonicalStudyRelationCluster[];
};

/** Collapse redundant MATCHES into lossless clusters; keep CHANGE/CONFLICT edges explicit. */
export function compactMatchRelations(
  relations: CanonicalStudyRelation[],
  entities: CanonicalStudyEntity[],
): CompactRelationsResult {
  const entityTypeById = new Map(entities.map((entity) => [entity.id, entity.recordTypeId] as const));
  const substantive = relations.filter((relation) => relation.label !== "MATCHES");
  const matches = relations.filter((relation) => relation.label === "MATCHES");

  const groups = new Map<string, CanonicalStudyRelation[]>();
  for (const relation of matches) {
    const recordTypeId = entityTypeById.get(relation.entityId) ?? "";
    const key = `${recordTypeId}|${relation.fieldId}|${relation.entityId}`;
    const list = groups.get(key) ?? [];
    list.push(relation);
    groups.set(key, list);
  }

  const relationClusters: CanonicalStudyRelationCluster[] = [];
  const compactMatches: CanonicalStudyRelation[] = [];

  for (const [groupKey, groupRelations] of groups) {
    const [recordTypeId, fieldId] = groupKey.split("|");
    const memberFieldKeys = new Set<string>();
    const entityIds = new Set<string>();
    for (const relation of groupRelations) {
      memberFieldKeys.add(relation.left.fieldKey);
      memberFieldKeys.add(relation.right.fieldKey);
      entityIds.add(relation.entityId);
    }
    const sortedMembers = [...memberFieldKeys].sort((a, b) => a.localeCompare(b));
    const clusterId = stableId(`cluster:matches:${recordTypeId}:${fieldId}:${sortedMembers.join(",")}`);
    relationClusters.push({
      id: clusterId,
      kind: "matches",
      recordTypeId: recordTypeId ?? "",
      fieldId: fieldId ?? "",
      memberFieldKeys: sortedMembers,
      entityIds: [...entityIds].sort((a, b) => a.localeCompare(b)),
    });

    const canonical = groupRelations.slice().sort((a, b) => a.id.localeCompare(b.id))[0]!;
    compactMatches.push({
      ...canonical,
      relationClusterId: clusterId,
    });
  }

  relationClusters.sort((a, b) => a.id.localeCompare(b.id));
  const output = [...substantive, ...compactMatches].sort((a, b) => a.id.localeCompare(b.id));
  return { relations: output, relationClusters };
}
