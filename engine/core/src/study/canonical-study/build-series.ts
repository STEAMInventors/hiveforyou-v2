import type {
  CanonicalStudyEntity,
  CanonicalStudyProvenanceChip,
  CanonicalStudySeries,
  CanonicalStudySeriesObservation,
} from "@hiveforyou/shared/canonical-study-artifact";

import { buildSeriesDimensionKey } from "./construct-keys.js";
import type { IndexedFoundation, IndexedRecordVersion } from "./indexed-foundation.js";
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

  const series = [...seriesByKey.values()];
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

function observedDateForRecord(record: IndexedRecordVersion): string | null {
  for (const fieldId of ["observed_on", "reporting_period", "effective_date"]) {
    const chip = record.provenanceByFieldKey[fieldId];
    const value = chip?.normalized.normalizedValue;
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return record.orderingDate;
}

function observationSignature(observation: CanonicalStudySeriesObservation): string {
  return `${observation.role}|${observation.observedDate ?? ""}|${JSON.stringify(observation.value.normalizedValue)}`;
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

    const observedDate = observedDateForRecord(input.indexedVersion);
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
    const signature = observationSignature(candidate);
    const existing = series.observations.find((observation) => observationSignature(observation) === signature);
    if (existing) {
      if (!provenanceEquals(existing.provenance, chip) && !existing.corroboratingProvenance.some((item) => provenanceEquals(item, chip))) {
        existing.corroboratingProvenance.push(chip);
      }
      continue;
    }
    series.observations.push(candidate);
  }
}

function provenanceEquals(left: CanonicalStudyProvenanceChip, right: CanonicalStudyProvenanceChip): boolean {
  return left.fieldKey === right.fieldKey;
}
