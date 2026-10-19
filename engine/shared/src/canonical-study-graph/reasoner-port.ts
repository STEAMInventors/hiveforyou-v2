import type { CanonicalStudyReasonerProposal, DomainPackPin, ObservationSnapshot } from "./types.js";

/**
 * Production Canonical Reasoner port.
 * Implementations use the same CallModel structured-output path in worker/core; tests inject fixtures.
 */
export type CanonicalStudyReasonerRequest = {
  studyRunId: string;
  attemptId: string;
  caseId: string;
  domainId: string;
  packPin: DomainPackPin;
  observationSnapshot: ObservationSnapshot;
  /** SHA-256 of compiled pack canonical-graph context (relationship types, identity guidance, etc.). */
  compiledPackContextSha256: string;
  /** Customer objective — emphasis only, never evidence. */
  customerObjective?: string | null;
};

export interface CanonicalStudyReasoner {
  propose(request: CanonicalStudyReasonerRequest): Promise<CanonicalStudyReasonerProposal>;
}

/** Adapter contract: verified Reader formats → observation snapshot (Phase C). */
export type VerifiedReaderToObservationSnapshotAdapter = {
  schemaVersion: "hive.observation-snapshot-adapter/1";
  /** Must accept reader-accepted-facts/1; may accept additional verified formats. */
  supportedSourceSchemaVersions: readonly ["reader-accepted-facts/1", ...string[]];
};
