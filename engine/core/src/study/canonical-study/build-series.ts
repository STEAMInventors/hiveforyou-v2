import type {
  CanonicalStudyEntity,
  CanonicalStudyProvenanceChip,
  CanonicalStudySeries,
  CanonicalStudySeriesObservation,
} from "@hiveforyou/shared/canonical-study-artifact";

import type { ProposalDomainPack } from "@hiveforyou/domain-pack";

import { buildSeriesDimensionKey, valuesEquivalent } from "./construct-keys.js";
import type { IndexedFoundation, IndexedRecordVersion } from "./indexed-foundation.js";
import { resolveRelationshipRules } from "./indexed-foundation.js";
import { stableId } from "./stable-id.js";

const VALUE_ROLES = ["value", "baseline_value", "target_value"] as const;

export function buildSeries(input: {
  indexed: IndexedFoundation;
  entities: CanonicalStudyEntity[];
}): CanonicalStudySeries[] {
  const { indexed, entities } = input;
  const seriesByKey = new Map<string, CanonicalStudySeries>();

  for (const entity of entities) {
    if (entity.status === "identity_unresolved") {
      continue;
    }
    const recordDef = indexed.pack.recordTypes.find((record) => record.id === entity.recordTypeId);
    for (const constructId of recordDef?.usesConstructs ?? []) {
      for (const version of entity.recordVersions) {
        const indexedVersion = indexed.recordsByGroupId.get(version.recordGroupId);
        if (!indexedVersion) {
          continue;
        }
        appendObservation({
          entity,
          indexedVersion,
          constructId,
          indexed,
          seriesByKey,
        });
      }
    }
  }

  let series = [...seriesByKey.values()];
  series = consolidateEquivalentSeries(series, indexed.pack);
  for (const item of series) {
    item.sourceEntityIds = [...new Set(item.sourceEntityIds)].sort((a, b) => a.localeCompare(b));
    item.entityId = item.sourceEntityIds.length === 1 ? item.sourceEntityIds[0]! : stableId(item.sourceEntityIds.join(","));
    item.observations.sort((a, b) => {
      const dateCmp = (a.observedDate ?? "").localeCompare(b.observedDate ?? "");
      if (dateCmp !== 0) {
        return dateCmp;
      }
      const roleCmp = a.role.localeCompare(b.role);
      if (roleCmp !== 0) {
        return roleCmp;
      }
      return a.provenance.fieldKey.localeCompare(b.provenance.fieldKey);
    });
    item.observations.forEach((observation, index) => {
      observation.orderingRank = index;
    });
  }
  series.sort((a, b) => a.id.localeCompare(b.id));
  return series;
}

function observedDateForRecord(
  record: IndexedRecordVersion,
  pack: ProposalDomainPack,
): string | null {
  for (const fieldId of pack.seriesObservationDateFieldIds ?? []) {
    const chip = record.provenanceByFieldKey[fieldId];
    const value = chip?.normalized.normalizedValue;
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  const rules = resolveRelationshipRules(pack);
  return rules.seriesOrderingDateFallback ? record.orderingDate : null;
}

function observationIdentitySignature(observation: CanonicalStudySeriesObservation): string {
  return `${observation.role}|${observation.observedDate ?? ""}|${JSON.stringify(observation.value.normalizedValue)}|${observation.provenance.fieldKey}`;
}

function eventIdentityMatches(
  left: IndexedRecordVersion,
  right: IndexedRecordVersion,
  constructId: string,
  pack: ProposalDomainPack,
): boolean {
  const policy = pack.constructs?.[constructId]?.seriesRestatementPolicy;
  const fieldIds = policy?.eventIdentityFieldIds ?? ["observed_on"];
  for (const fieldId of fieldIds) {
    const leftValue = left.provenanceByFieldKey[fieldId]?.normalized.normalizedValue;
    const rightValue = right.provenanceByFieldKey[fieldId]?.normalized.normalizedValue;
    if (leftValue != null && rightValue != null && JSON.stringify(leftValue) !== JSON.stringify(rightValue)) {
      return false;
    }
  }
  return true;
}

function canCorroborateObservation(input: {
  existing: CanonicalStudySeriesObservation;
  candidate: CanonicalStudySeriesObservation;
  existingRecord: IndexedRecordVersion;
  candidateRecord: IndexedRecordVersion;
  constructId: string;
  pack: ProposalDomainPack;
}): boolean {
  const policy = input.pack.constructs?.[input.constructId]?.seriesRestatementPolicy;
  if (!policy?.allowExplicitRestatementCorroboration) {
    return false;
  }
  if (input.existing.role !== input.candidate.role) {
    return false;
  }
  if (input.existing.observedDate !== input.candidate.observedDate) {
    return false;
  }
  if (
    JSON.stringify(input.existing.value.normalizedValue) !==
    JSON.stringify(input.candidate.value.normalizedValue)
  ) {
    return false;
  }
  if (input.existing.provenance.fieldKey === input.candidate.provenance.fieldKey) {
    return false;
  }
  return eventIdentityMatches(input.existingRecord, input.candidateRecord, input.constructId, input.pack);
}

function appendObservation(input: {
  entity: CanonicalStudyEntity;
  indexedVersion: IndexedRecordVersion;
  constructId: string;
  indexed: IndexedFoundation;
  seriesByKey: Map<string, CanonicalStudySeries>;
}): void {
  const dimensionKey = buildSeriesDimensionKey(input.indexedVersion, input.constructId, input.indexed.pack);
  if (!dimensionKey) {
    return;
  }

  for (const fieldId of VALUE_ROLES) {
    const chip = input.indexedVersion.provenanceByFieldKey[fieldId];
    if (!chip) {
      continue;
    }

    const observedDate = observedDateForRecord(input.indexedVersion, input.indexed.pack);
    const material = `${input.constructId}|${dimensionKey}`;
    const seriesId = stableId(material);
    let series = input.seriesByKey.get(seriesId);
    if (!series) {
      series = {
        id: seriesId,
        entityId: input.entity.id,
        sourceEntityIds: [],
        constructId: input.constructId,
        dimensionKey,
        observations: [],
        unresolvedReasons: [],
      };
      input.seriesByKey.set(seriesId, series);
    }
    if (!series.sourceEntityIds.includes(input.entity.id)) {
      series.sourceEntityIds.push(input.entity.id);
    }

    if (!observedDate) {
      if (!series.unresolvedReasons.includes("missing_observed_date")) {
        series.unresolvedReasons.push("missing_observed_date");
      }
      continue;
    }

    const candidate: CanonicalStudySeriesObservation = {
      orderingRank: series.observations.length,
      role: fieldId,
      observedDate,
      value: chip.normalized,
      provenance: chip,
      corroboratingProvenance: [],
    };
    const duplicate = series.observations.find(
      (observation) => observationIdentitySignature(observation) === observationIdentitySignature(candidate),
    );
    if (duplicate) {
      continue;
    }

    const corroborationTarget = series.observations.find((observation) =>
      canCorroborateObservation({
        existing: observation,
        candidate,
        existingRecord:
          input.indexed.recordsByGroupId.get(observation.provenance.recordGroupId) ?? input.indexedVersion,
        candidateRecord: input.indexedVersion,
        constructId: input.constructId,
        pack: input.indexed.pack,
      }),
    );
    if (corroborationTarget) {
      if (!corroborationTarget.corroboratingProvenance.some((item) => item.fieldKey === chip.fieldKey)) {
        corroborationTarget.corroboratingProvenance.push(chip);
      }
      continue;
    }
    series.observations.push(candidate);
  }
}

function provenanceEquals(left: CanonicalStudyProvenanceChip, right: CanonicalStudyProvenanceChip): boolean {
  return left.fieldKey === right.fieldKey;
}

function dimensionPart(dimensionKey: string, fieldSuffix: string): string | null {
  const prefix = `${fieldSuffix}=`;
  const part = dimensionKey.split("|").find((item) => item.startsWith(prefix));
  return part ? part.slice(prefix.length) : null;
}

function seriesMergeKey(series: CanonicalStudySeries): string {
  const scoreType = dimensionPart(series.dimensionKey, "measure.score_type") ?? "";
  return `${series.constructId}|${scoreType}`;
}

function mergeSeriesObservations(
  target: CanonicalStudySeries,
  source: CanonicalStudySeries,
): void {
  for (const observation of source.observations) {
    const signature = observationIdentitySignature(observation);
    const existing = target.observations.find((item) => observationIdentitySignature(item) === signature);
    if (existing) {
      if (
        !provenanceEquals(existing.provenance, observation.provenance) &&
        !existing.corroboratingProvenance.some((item) => provenanceEquals(item, observation.provenance))
      ) {
        existing.corroboratingProvenance.push(observation.provenance);
      }
      for (const chip of observation.corroboratingProvenance) {
        if (
          !provenanceEquals(existing.provenance, chip) &&
          !existing.corroboratingProvenance.some((item) => provenanceEquals(item, chip))
        ) {
          existing.corroboratingProvenance.push(chip);
        }
      }
      continue;
    }
    target.observations.push({
      ...observation,
      corroboratingProvenance: observation.corroboratingProvenance.slice(),
    });
  }
  for (const reason of source.unresolvedReasons) {
    if (!target.unresolvedReasons.includes(reason)) {
      target.unresolvedReasons.push(reason);
    }
  }
  for (const entityId of source.sourceEntityIds) {
    if (!target.sourceEntityIds.includes(entityId)) {
      target.sourceEntityIds.push(entityId);
    }
  }
}

function consolidateEquivalentSeries(
  series: CanonicalStudySeries[],
  pack: ProposalDomainPack,
): CanonicalStudySeries[] {
  const groups = new Map<string, CanonicalStudySeries[]>();
  for (const item of series) {
    const key = seriesMergeKey(item);
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  const merged: CanonicalStudySeries[] = [];
  for (const group of groups.values()) {
    const sorted = group.slice().sort((a, b) => a.dimensionKey.localeCompare(b.dimensionKey));
    const absorbed = new Set<string>();
    for (let i = 0; i < sorted.length; i += 1) {
      const left = sorted[i]!;
      if (absorbed.has(left.id)) {
        continue;
      }
      let canonical = left;
      for (let j = i + 1; j < sorted.length; j += 1) {
        const right = sorted[j]!;
        if (absorbed.has(right.id)) {
          continue;
        }
        const leftTask = dimensionPart(left.dimensionKey, "measure.task");
        const rightTask = dimensionPart(right.dimensionKey, "measure.task");
        const equivalent = valuesEquivalent(leftTask, rightTask, left.constructId, pack);
        if (equivalent === "different") {
          continue;
        }
        if (right.dimensionKey.localeCompare(canonical.dimensionKey) < 0) {
          mergeSeriesObservations(right, canonical);
          absorbed.add(canonical.id);
          canonical = right;
        } else {
          mergeSeriesObservations(canonical, right);
          absorbed.add(right.id);
        }
      }
      merged.push(canonical);
      absorbed.add(canonical.id);
    }
  }
  return merged;
}
