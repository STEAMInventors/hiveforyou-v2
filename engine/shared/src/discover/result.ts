import type { DocumentDiscoveryResult } from "../discovery";
import type { DiscoverCollectionUnderstanding } from "./proposal-v2";
import type { DiscoverQuestion } from "./discovery-question";
import type { HiveDiscoverProposalV1 } from "./proposal";
import type { HiveDiscoverProposalV2 } from "./proposal-v2";
import type { StructureMap } from "./structure-map";
import type { HiveDiscoverValidationResult } from "./validation";

export type DiscoverRunStatus =
  | "RUNNING"
  | "SUCCEEDED"
  | "NEEDS_REVIEW"
  | "NEEDS_OBJECTIVE_INPUT"
  | "NEEDS_DISCOVERY_INPUT"
  | "NEEDS_EVIDENCE_INPUT"
  | "READY_FOR_STUDY"
  | "FAILED";

export type DiscoverRunPhase =
  | "VERIFYING_SOURCES"
  | "MODEL_DISCOVERY"
  | "VALIDATING"
  | "AWAITING_OBJECTIVE"
  | "AWAITING_DISCOVERY_ANSWERS"
  | "RESOLVING"
  | "VALIDATING_RESOLUTION"
  | "BUILDING_STRUCTURE_MAP"
  | "CHECKING_COMPLETENESS"
  | "AWAITING_EVIDENCE_DISPOSITIONS"
  | "COMPLETE";

export type DiscoverRunErrorCode =
  | "DISCOVER_ENGINE_UNAVAILABLE"
  | "MALFORMED_PROPOSAL"
  | "VALIDATION_FAILED"
  | "PROVIDER_ERROR"
  | "MISSING_SOURCE_DOCUMENTS"
  | "PERSISTENCE_FAILURE"
  | "UNEXPECTED";

export type HiveDiscoverRun = {
  discoverRunId: string;
  caseId: string;
  intakeRunId?: string | null;
  idempotencyKey: string;
  phase?: DiscoverRunPhase;
  providerId: string;
  providerMode: "fixture" | "openai" | "unconfigured";
  modelId?: string;
  reasoningEffort?: string;
  promptId: string;
  promptVersion: string;
  promptSha256: string;
  domainPackId: string;
  domainPackVersion: string;
  startedAt: string;
  completedAt?: string;
  status: DiscoverRunStatus;
  errorCode?: DiscoverRunErrorCode;
  errorMessage?: string;
};

export type HiveDiscoverResult = {
  run: HiveDiscoverRun;
  rawProposal?: HiveDiscoverProposalV1 | HiveDiscoverProposalV2;
  validationResult?: HiveDiscoverValidationResult;
  /** Call #1 collection understanding — model proposals until customer confirms context. */
  collectionUnderstanding?: DiscoverCollectionUnderstanding;
  documentDiscovery?: DocumentDiscoveryResult;
  structureMap?: StructureMap;
  discoveryQuestions?: DiscoverQuestion[];
};
