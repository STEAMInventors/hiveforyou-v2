import type { Engine2DomainCustomerContext } from "../case-customer-context";
import type { StructureMap, StructureMapLogicalDocument } from "../discover/structure-map";
import type { DocumentDiscoveryResult } from "../discovery";
import type { QuestionSetSnapshot, QuestionsAnswerSnapshot } from "../questions";

import type { StudySourceDocumentRef } from "./source-document";

export const CANONICAL_STUDY_CONTEXT_SCHEMA = "canonical-study-context/2" as const;

export type DomainPackVocabularySnapshot = {
  entityTypes: string[];
  claimTypes: string[];
  relationshipTypes: string[];
  eventTypes: string[];
  /** @deprecated Engine 2 rejects non-document evidence; retained for persisted context compatibility. */
  userResponseFactualClaimTypes?: string[];
};

export type StudyProcessingMode = "canonical_openai_v4" | "pack_driven_v1";

export type ReaderPreflightSnapshot = {
  modelProvider: string;
  modelName: string;
  observedAt: string;
  source: "hive-agents/health";
};

export type StudyProcessingPolicy = {
  /** User/analysis intent must never alter factual acceptance rules. */
  intentAffectsFacts: false;
  processingMode?: StudyProcessingMode;
  providerId: string;
  providerMode: "fixture" | "openai" | "unconfigured" | "reader_delegated";
  promptId?: string;
  promptVersion?: string;
  promptSha256?: string;
  /** Pack-driven reader proposal pack content hash when processingMode is pack_driven_v1. */
  proposalPackContentSha256?: string;
  /** Domain-agnostic Reader prompt compiler version when processingMode is pack_driven_v1. */
  readerCompilerVersion?: string;
  /** Non-authoritative hive-agents /health snapshot captured at load-context. */
  readerPreflight?: ReaderPreflightSnapshot;
  /** Discover structure map material fingerprint when bound from Discover. */
  discoverStructureFingerprint?: string;
};

/**
 * Immutable input to one Engine 2 study run.
 * Created and persisted only by core orchestration — not assembled in the UI.
 */
export type CanonicalStudyContext = {
  schemaVersion: typeof CANONICAL_STUDY_CONTEXT_SCHEMA;
  caseId: string;
  studyRunId: string;
  idempotencyKey: string;
  createdAt: string;
  intakeRunId?: string;
  discoveryRunId?: string;
  /** Presentation label from Engine 1 — not used for pack or validation identity. */
  domainLabel: string;
  /** Stable canonical domain identity (e.g. iep). */
  domainId: string;
  domainPackId: string;
  domainPackVersion: string;
  domainPackVocabulary: DomainPackVocabularySnapshot;
  sourceDocuments: StudySourceDocumentRef[];
  engine1Result: DocumentDiscoveryResult;
  questionSetVersion: string;
  questionSet: QuestionSetSnapshot;
  answerSnapshot: QuestionsAnswerSnapshot;
  /** Immutable answer-snapshot row used for this run. */
  answerSnapshotId?: string;
  previousCaseIntelligenceVersion?: number;
  /**
   * Confirmed objective for this domain workstream.
   * Guides analytical focus only — must not alter factual acceptance rules.
   * Audience and share intent are not included.
   */
  customerContext?: Engine2DomainCustomerContext;
  /** Scoped Structure Map for this domain workstream when discover v2 completed. */
  structureMap?: StructureMap;
  /** Logical documents used for strict provenance (subset of structure map). */
  logicalDocuments: StructureMapLogicalDocument[];
  processingPolicy: StudyProcessingPolicy;
};
