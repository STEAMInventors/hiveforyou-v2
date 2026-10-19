import type {
  AcceptedCanonicalStudyGraph,
  CanonicalStudyReasonerProposal,
  ObservationSnapshot,
} from "./types.js";
import {
  CANONICAL_STUDY_GRAPH_SCHEMA_VERSION,
  CANONICAL_STUDY_GRAPH_VALIDATION_SCHEMA_VERSION,
  CANONICAL_STUDY_REASONER_PROPOSAL_SCHEMA_VERSION,
  OBSERVATION_SNAPSHOT_SCHEMA_VERSION,
} from "./types.js";
import type { CanonicalStudyGraphValidationResult } from "./validation-result.js";

/** Named persistence slots for one study attempt (bucket paths resolved via hive-artifact-paths). */
export type CanonicalStudyGraphPersistenceSlots = {
  observationSnapshot: {
    schemaVersion: typeof OBSERVATION_SNAPSHOT_SCHEMA_VERSION;
    studyRunId: string;
    attemptId: string;
    contentDigest: string;
  };
  reasonerProposal: {
    schemaVersion: typeof CANONICAL_STUDY_REASONER_PROPOSAL_SCHEMA_VERSION;
    studyRunId: string;
    attemptId: string;
  };
  graphValidation: {
    schemaVersion: typeof CANONICAL_STUDY_GRAPH_VALIDATION_SCHEMA_VERSION;
    studyRunId: string;
    attemptId: string;
  };
  acceptedGraph: {
    schemaVersion: typeof CANONICAL_STUDY_GRAPH_SCHEMA_VERSION;
    studyRunId: string;
    attemptId: string;
    contentDigest: string;
  };
};

export function describeGraphPersistenceSlots(input: {
  observationSnapshot: ObservationSnapshot;
  reasonerProposal?: CanonicalStudyReasonerProposal | null;
  graphValidation?: CanonicalStudyGraphValidationResult | null;
  acceptedGraph?: AcceptedCanonicalStudyGraph | null;
}): CanonicalStudyGraphPersistenceSlots {
  const base: CanonicalStudyGraphPersistenceSlots = {
    observationSnapshot: {
      schemaVersion: OBSERVATION_SNAPSHOT_SCHEMA_VERSION,
      studyRunId: input.observationSnapshot.studyRunId,
      attemptId: input.observationSnapshot.attemptId,
      contentDigest: input.observationSnapshot.contentDigest,
    },
    reasonerProposal: {
      schemaVersion: CANONICAL_STUDY_REASONER_PROPOSAL_SCHEMA_VERSION,
      studyRunId: input.observationSnapshot.studyRunId,
      attemptId: input.observationSnapshot.attemptId,
    },
    graphValidation: {
      schemaVersion: CANONICAL_STUDY_GRAPH_VALIDATION_SCHEMA_VERSION,
      studyRunId: input.observationSnapshot.studyRunId,
      attemptId: input.observationSnapshot.attemptId,
    },
    acceptedGraph: {
      schemaVersion: CANONICAL_STUDY_GRAPH_SCHEMA_VERSION,
      studyRunId: input.observationSnapshot.studyRunId,
      attemptId: input.observationSnapshot.attemptId,
      contentDigest: input.acceptedGraph?.contentDigest ?? "",
    },
  };
  void input.reasonerProposal;
  void input.graphValidation;
  return base;
}
