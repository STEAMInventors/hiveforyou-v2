import type { ObservationSnapshot, SnapshotObservation } from "@hiveforyou/shared/canonical-study-graph";

export const OBSERVATION_SNAPSHOT_ADAPTER_SCHEMA_VERSION =
  "hive.observation-snapshot-adapter/1" as const;

export type ObservationNormalizationQuarantineRecord = {
  index: number;
  readerFactId: string | null;
  code: string;
  message: string;
  fact: Record<string, unknown>;
};

export type ObservationNormalizationResult = {
  snapshot: ObservationSnapshot | null;
  accepted: SnapshotObservation[];
  quarantined: ObservationNormalizationQuarantineRecord[];
  /** True when every input fact was quarantined. */
  empty: boolean;
};
