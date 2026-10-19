export {
  normalizeReaderAcceptedFacts,
  verifiedReaderToObservationSnapshotAdapter,
  OBSERVATION_SNAPSHOT_ADAPTER_SCHEMA_VERSION,
  type NormalizeReaderAcceptedFactsInput,
} from "./normalize-reader-accepted-facts.js";
export type {
  ObservationNormalizationQuarantineRecord,
  ObservationNormalizationResult,
} from "./types.js";
export {
  claimValueFromWire,
  evidenceRefsFromWire,
  isVerifiedReaderFact,
  readerFactIdFromWire,
} from "./wire-fact.js";
