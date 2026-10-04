import type {
  CanonicalCaseSnapshot,
  ProposedEntity,
  UnresolvedItem,
  ValidatedClaim,
} from "@hiveforyou/shared/case-intelligence/3";
import type {
  CaseMap,
  CaseMapAttention,
  CaseMapChronologyEntry,
  CaseMapDisclosureLevel,
  CaseMapEdge,
  CaseMapNode,
} from "@hiveforyou/shared/projections";
import { CASE_MAP_SCHEMA } from "@hiveforyou/shared/projections";
import type {
  CaseMapProjectionPackSnapshot,
  CaseMapZoneDefinition,
} from "@hiveforyou/domain-pack";

import { formatValidatedClaimSentence, humanizeConstruct } from "./format-v3-claim";

const FALLBACK_ZONE_ID = "fallback";
const ENTITY_ZONE_ID = "entities";

const QUIET_ROLES = new Set(["historical", "superseded"]);
const PROMINENT_ROLES = new Set(["current"]);

function disclosureForRole(role: ValidatedClaim["role"]): CaseMapDisclosureLevel {
  if (PROMINENT_ROLES.has(role)) {
    return "prominent";
  }
  if (QUIET_ROLES.has(role)) {
    return "quiet";
  }
  return "normal";
}

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, "en", { sensitivity: "base" });
}

function zoneForClaim(
  claim: ValidatedClaim,
  entity: ProposedEntity | undefined,
  zones: CaseMapZoneDefinition[],
  fallbackZoneId: string,
): string {
  const sorted = [...zones].sort((a, b) => a.order - b.order || compareStrings(a.zoneId, b.zoneId));
  for (const zone of sorted) {
    const match = zone.match;
    if (!match) {
      continue;
    }
    if (match.constructs?.includes(claim.construct)) {
      return zone.zoneId;
    }
    if (
      match.constructPrefixes?.some((prefix) => claim.construct.startsWith(prefix))
    ) {
      return zone.zoneId;
    }
    if (entity && match.subjectEntityTypes?.includes(entity.entityType)) {
      return zone.zoneId;
    }
  }
  return fallbackZoneId;
}

function constructGroupKey(claim: ValidatedClaim): string {
  return `${claim.subjectEntityId}\0${claim.construct}`;
}

function factNodeKind(role: ValidatedClaim["role"]): "fact" | "decision" {
  return role === "decided" ? "decision" : "fact";
}

function isEvidenceGapUnresolved(item: UnresolvedItem): boolean {
  return item.kind === "missing_information";
}

function ghostLabel(item: UnresolvedItem): string {
  if (item.description?.trim()) {
    return item.description.trim();
  }
  if (item.kind === "missing_document") {
    return "Expected document not present in the case";
  }
  return "Information gap";
}

export function projectCaseMapV3(input: {
  intelligence: CanonicalCaseSnapshot;
  packProjection: CaseMapProjectionPackSnapshot;
}): CaseMap {
  const { intelligence, packProjection } = input;
  const entitiesById = new Map(intelligence.entities.map((entity) => [entity.id, entity]));
  const fallbackLabel =
    packProjection.fallbackZoneLabel?.trim() || "Other understanding";
  const rootLabel = packProjection.rootLabel?.trim() || "Case";
  const rootNodeId = `root:${intelligence.caseId}`;

  const nodes: CaseMapNode[] = [];
  const edges: CaseMapEdge[] = [];
  const attention: CaseMapAttention[] = [];

  const addEdge = (fromNodeId: string, toNodeId: string) => {
    const id = `edge:${fromNodeId}->${toNodeId}`;
    if (edges.some((edge) => edge.id === id)) {
      return;
    }
    edges.push({ id, fromNodeId, toNodeId, kind: "contains" });
  };

  nodes.push({
    id: rootNodeId,
    kind: "root",
    label: rootLabel,
    depth: 0,
  });

  const zoneNodes = new Map<string, CaseMapNode>();
  const ensureZone = (zoneId: string, label: string, order: number) => {
    if (zoneNodes.has(zoneId)) {
      return zoneNodes.get(zoneId)!;
    }
    const node: CaseMapNode = {
      id: `zone:${zoneId}`,
      kind: "zone",
      label,
      zoneId,
      depth: 1,
      display: { order: String(order) },
    };
    zoneNodes.set(zoneId, node);
    nodes.push(node);
    addEdge(rootNodeId, node.id);
    return node;
  };

  for (const zone of [...packProjection.zones].sort(
    (a, b) => a.order - b.order || compareStrings(a.zoneId, b.zoneId),
  )) {
    ensureZone(zone.zoneId, zone.label, zone.order);
  }
  ensureZone(FALLBACK_ZONE_ID, fallbackLabel, 9999);

  if (intelligence.entities.length) {
    const entityZone = ensureZone(ENTITY_ZONE_ID, "People & organizations", 0);
    for (const entity of [...intelligence.entities].sort((a, b) =>
      compareStrings(a.id, b.id),
    )) {
      const entityNodeId = `entity:${entity.id}`;
      nodes.push({
        id: entityNodeId,
        kind: "construct",
        label: entity.label,
        subjectEntityId: entity.id,
        zoneId: ENTITY_ZONE_ID,
        depth: 2,
        claimIds: [],
      });
      addEdge(entityZone.id, entityNodeId);
    }
  }

  const constructNodes = new Map<string, string>();

  const sortedClaims = [...intelligence.claims].sort((a, b) => compareStrings(a.id, b.id));
  for (const claim of sortedClaims) {
    const entity = entitiesById.get(claim.subjectEntityId);
    const zoneId = zoneForClaim(claim, entity, packProjection.zones, FALLBACK_ZONE_ID);
    const zoneDef =
      packProjection.zones.find((zone) => zone.zoneId === zoneId) ??
      ({ zoneId: FALLBACK_ZONE_ID, label: fallbackLabel, order: 9999 } as CaseMapZoneDefinition);
    const zoneNode = ensureZone(zoneDef.zoneId, zoneDef.label, zoneDef.order);

    const groupKey = constructGroupKey(claim);
    let constructNodeId = constructNodes.get(`${zoneId}\0${groupKey}`);
    if (!constructNodeId) {
      constructNodeId = `construct:${zoneId}:${claim.subjectEntityId}:${claim.construct}`;
      constructNodes.set(`${zoneId}\0${groupKey}`, constructNodeId);
      nodes.push({
        id: constructNodeId,
        kind: "construct",
        label: humanizeConstruct(claim.construct),
        construct: claim.construct,
        subjectEntityId: claim.subjectEntityId,
        zoneId,
        depth: 2,
      });
      addEdge(zoneNode.id, constructNodeId);
    }

    const factId = `fact:${claim.id}`;
    nodes.push({
      id: factId,
      kind: factNodeKind(claim.role),
      label: humanizeConstruct(claim.construct),
      summary: formatValidatedClaimSentence(claim, entitiesById),
      claimIds: [claim.id],
      claimRole: claim.role,
      subjectEntityId: claim.subjectEntityId,
      construct: claim.construct,
      zoneId,
      disclosureLevel: disclosureForRole(claim.role),
      depth: 3,
    });
    addEdge(constructNodeId, factId);
  }

  for (const change of [...intelligence.changes].sort((a, b) => compareStrings(a.id, b.id))) {
    const changeNodeId = `change:${change.id}`;
    nodes.push({
      id: changeNodeId,
      kind: "change",
      label: humanizeConstruct(change.construct),
      changeId: change.id,
      fromClaimId: change.fromClaimId,
      toClaimId: change.toClaimId,
      claimIds: [change.fromClaimId, change.toClaimId],
      subjectEntityId: change.subjectEntityId,
      construct: change.construct,
      depth: 2,
    });
    const fromClaim = intelligence.claims.find((row) => row.id === change.fromClaimId);
    const zoneId = fromClaim
      ? zoneForClaim(fromClaim, entitiesById.get(fromClaim.subjectEntityId), packProjection.zones, FALLBACK_ZONE_ID)
      : FALLBACK_ZONE_ID;
    const zoneDef =
      packProjection.zones.find((zone) => zone.zoneId === zoneId) ??
      ({ zoneId: FALLBACK_ZONE_ID, label: fallbackLabel, order: 9999 } as CaseMapZoneDefinition);
    const zoneNode = ensureZone(zoneDef.zoneId, zoneDef.label, zoneDef.order);
    addEdge(zoneNode.id, changeNodeId);
  }

  for (const item of [...intelligence.unresolved].sort((a, b) => compareStrings(a.id, b.id))) {
    if (isEvidenceGapUnresolved(item)) {
      const ghostId = `ghost:${item.id}`;
      nodes.push({
        id: ghostId,
        kind: "ghost",
        label: ghostLabel(item),
        unresolvedId: item.id,
        subjectEntityId: item.subjectEntityId,
        construct: item.relatedConstruct,
        depth: 2,
      });
      addEdge(rootNodeId, ghostId);
      attention.push({
        id: `attention:gap:${item.id}`,
        kind: "evidence_gap",
        label: ghostLabel(item),
        nodeId: ghostId,
        unresolvedId: item.id,
        claimIds: item.relatedClaimIds,
      });
    } else if (item.kind === "missing_document") {
      const ghostId = `ghost:${item.id}`;
      nodes.push({
        id: ghostId,
        kind: "ghost",
        label: ghostLabel(item),
        unresolvedId: item.id,
        depth: 2,
      });
      addEdge(rootNodeId, ghostId);
      attention.push({
        id: `attention:unresolved:${item.id}`,
        kind: "unresolved",
        label: ghostLabel(item),
        nodeId: ghostId,
        unresolvedId: item.id,
      });
    } else if (item.kind === "conflict_open") {
      attention.push({
        id: `attention:unresolved-conflict:${item.id}`,
        kind: "conflict",
        label: "Open conflict requires review",
        unresolvedId: item.id,
        claimIds: item.relatedClaimIds,
      });
    }
  }

  for (const conflict of [...intelligence.conflicts].sort((a, b) => compareStrings(a.id, b.id))) {
    attention.push({
      id: `attention:conflict:${conflict.id}`,
      kind: "conflict",
      label: "Conflicting validated claims",
      conflictId: conflict.id,
      claimIds: [...conflict.claimIds].sort(compareStrings),
    });
  }

  const chronology: CaseMapChronologyEntry[] = [...intelligence.events]
    .sort((a, b) => {
      const aDate = a.occurredOn ?? "";
      const bDate = b.occurredOn ?? "";
      if (aDate !== bDate) {
        if (!aDate) {
          return 1;
        }
        if (!bDate) {
          return -1;
        }
        return compareStrings(aDate, bDate);
      }
      const aOrder = a.timelineOrderHint ?? Number.MAX_SAFE_INTEGER;
      const bOrder = b.timelineOrderHint ?? Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      return compareStrings(a.id, b.id);
    })
    .map((event) => {
      const claim = intelligence.claims.find((row) => row.id === event.claimId);
      const subject = entitiesById.get(event.subjectEntityId)?.label ?? event.subjectEntityId;
      const constructLabel = humanizeConstruct(event.construct);
      return {
        id: `chronology:${event.id}`,
        eventId: event.id,
        claimId: event.claimId,
        subjectEntityId: event.subjectEntityId,
        construct: event.construct,
        occurredOn: event.occurredOn,
        datePrecision: claim?.effectivePeriod?.precision ?? (event.occurredOn ? "day" : "unknown"),
        timelineOrderHint: event.timelineOrderHint,
        label: claim
          ? formatValidatedClaimSentence(claim, entitiesById)
          : `${subject}: ${constructLabel}`,
      };
    });

  nodes.sort((a, b) => compareStrings(a.id, b.id));
  edges.sort((a, b) => compareStrings(a.id, b.id));
  attention.sort((a, b) => compareStrings(a.id, b.id));

  return {
    schemaVersion: CASE_MAP_SCHEMA,
    caseId: intelligence.caseId,
    studyRunId: intelligence.studyRunId,
    intelligenceVersion: intelligence.version,
    domainId: intelligence.domainId,
    domainPackId: packProjection.domainPackId,
    domainPackVersion: packProjection.domainPackVersion,
    projectionVersion: 1,
    rootNodeId,
    nodes,
    edges,
    attention,
    chronology,
  };
}
