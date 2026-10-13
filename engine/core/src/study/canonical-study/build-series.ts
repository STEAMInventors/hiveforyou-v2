import type {
  CanonicalStudyEntity,
  CanonicalStudySeries,
  CanonicalStudySeriesObservation,
} from "@hiveforyou/shared/canonical-study-artifact";

import { buildConstructJoinKey } from "./construct-keys.js";
import type { IndexedFoundation, IndexedRecordVersion } from "./indexed-foundation.js";
import { stableId } from "./stable-id.js";

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
    item.observations.sort((a, b) => {
      const dateCmp = (a.observedDate ?? "").localeCompare(b.observedDate ?? "");
      if (dateCmp !== 0) {
        return dateCmp;
      }
      return a.orderingRank - b.orderingRank;
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

function appendObservation(input: {
  entity: CanonicalStudyEntity;
  indexedVersion: IndexedRecordVersion;
  constructId: string;
  indexed: IndexedFoundation;
  seriesByKey: Map<string, CanonicalStudySeries>;
}): void {
  const dimensionKey = buildConstructJoinKey(input.indexedVersion, input.constructId, input.indexed.pack);
  if (!dimensionKey) {
    return;
  }

  const valueFieldIds = ["value", "baseline_value", "target_value"];
  for (const fieldId of valueFieldIds) {
    const chip = input.indexedVersion.provenanceByFieldKey[fieldId];
    if (!chip) {
      continue;
    }

    const observedDate = observedDateForRecord(input.indexedVersion);
    const material = `${input.entity.id}|${input.constructId}|${dimensionKey}|${fieldId}`;
    const seriesId = stableId(material);
    let series = input.seriesByKey.get(seriesId);
    if (!series) {
      series = {
        id: seriesId,
        entityId: input.entity.id,
        constructId: input.constructId,
        dimensionKey,
        observations: [],
        unresolvedReasons: observedDate ? [] : ["missing_observed_date"],
      };
      input.seriesByKey.set(seriesId, series);
    }

    if (!observedDate) {
      if (!series.unresolvedReasons.includes("missing_observed_date")) {
        series.unresolvedReasons.push("missing_observed_date");
      }
      continue;
    }

    const observation: CanonicalStudySeriesObservation = {
      orderingRank: series.observations.length,
      observedDate,
      value: chip.normalized,
      provenance: chip,
    };
    series.observations.push(observation);
  }
}
