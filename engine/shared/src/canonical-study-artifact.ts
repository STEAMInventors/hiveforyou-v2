export const CANONICAL_STUDY_ARTIFACT_SCHEMA_VERSION = "hive.canonical-study/1" as const;

import type {
  CanonicalStudyFoundationEvidence,
  CanonicalStudyFoundationEnvelopeRef,
  CanonicalStudyFoundationNormalizedValue,
  CanonicalStudyFoundationRejectedField,
  CanonicalStudyFoundationUnresolvedItem,
} from "./canonical-study-foundation.js";

/** Trusted metadata supplied by the caller — no fetching inside the engine. */
export type CanonicalStudySourceContext = {
  logicalDocuments?: Array<{
    sourceDocumentId: string;
    logicalDocumentId?: string;
    filename?: string;
  }>;
  jurisdiction?: string;
  referenceTables?: Record<string, { rows: unknown[] }>;
};

export type CanonicalStudyProvenanceChip = {
  fieldKey: string;
  recordGroupId: string;
  sourceDocumentId: string;
  recordTypeId: string;
  instanceIndex: number;
  fieldId: string;
  evidence: CanonicalStudyFoundationEvidence[];
  normalized: CanonicalStudyFoundationNormalizedValue;
  envelopeRef: CanonicalStudyFoundationEnvelopeRef;
};

export type CanonicalStudyRecordVersion = {
  recordGroupId: string;
  sourceDocumentId: string;
  recordTypeId: string;
  instanceIndex: number;
  documentTypeId: string | null;
  orderingDate: string | null;
  party: string | null;
  fieldKeys: string[];
  provenanceByFieldKey: Record<string, CanonicalStudyProvenanceChip>;
};

export type CanonicalStudyEntityStatus = "resolved" | "identity_unresolved";

export type CanonicalStudyEntity = {
  id: string;
  recordTypeId: string;
  status: CanonicalStudyEntityStatus;
  contentKey: string | null;
  recordVersions: CanonicalStudyRecordVersion[];
  reasons: string[];
};

export type CanonicalStudyPossiblySameLink = {
  id: string;
  leftEntityId: string;
  rightEntityId: string;
  recordTypeId: string;
  reason: string;
  leftProvenance: CanonicalStudyProvenanceChip[];
  rightProvenance: CanonicalStudyProvenanceChip[];
};

export type CanonicalStudyDocumentLineageEdge = {
  id: string;
  kind: "amends" | "supersedes";
  fromSourceDocumentId: string;
  toSourceDocumentId: string;
  status: "linked" | "unresolved";
};

export type CanonicalStudyOperativeSlotStatus =
  | "operative"
  | "historical"
  | "conflicted"
  | "unresolved";

export type CanonicalStudyOperativeFieldValue = {
  fieldId: string;
  status: CanonicalStudyOperativeSlotStatus;
  provenance: CanonicalStudyProvenanceChip | null;
  competingProvenance: CanonicalStudyProvenanceChip[];
};

export type CanonicalStudyOperativeRecord = {
  entityId: string;
  recordTypeId: string;
  contentKey: string | null;
  fields: CanonicalStudyOperativeFieldValue[];
  sourceRecordGroupIds: string[];
};

export type CanonicalStudyOperativeView = {
  id: string;
  baseDocumentTypeId: string;
  baseSourceDocumentId: string;
  amendmentSourceDocumentIds: string[];
  status: "resolved" | "conflicted" | "unresolved";
  records: CanonicalStudyOperativeRecord[];
  unresolvedItems: string[];
};

export type CanonicalStudyRelationLabel =
  | "MATCHES"
  | "UNCHANGED"
  | "CHANGE"
  | "CONFLICT";

export type CanonicalStudyRelation = {
  id: string;
  label: CanonicalStudyRelationLabel;
  entityId: string;
  fieldId: string;
  left: CanonicalStudyProvenanceChip;
  right: CanonicalStudyProvenanceChip;
  temporalBasis: string | null;
  partyBasis: string | null;
};

export type CanonicalStudyUnresolvedComparison = {
  id: string;
  entityId: string;
  fieldId: string;
  left: CanonicalStudyProvenanceChip;
  right: CanonicalStudyProvenanceChip;
  reason: string;
};

export type CanonicalStudySeriesObservation = {
  orderingRank: number;
  observedDate: string | null;
  value: CanonicalStudyFoundationNormalizedValue;
  provenance: CanonicalStudyProvenanceChip;
};

export type CanonicalStudySeries = {
  id: string;
  entityId: string;
  constructId: string;
  dimensionKey: string;
  observations: CanonicalStudySeriesObservation[];
  unresolvedReasons: string[];
};

export type CanonicalStudyRequirementOutcome =
  | "PRESENT"
  | "FIELD_PRESENT_BUT_EMPTY"
  | "NOT_FOUND_IN_SUPPLIED_DOCUMENTS"
  | "UNRESOLVED"
  | "NOT_APPLICABLE";

export type CanonicalStudyRequirementResult = {
  id: string;
  ruleId: string;
  outcome: CanonicalStudyRequirementOutcome;
  scope: string;
  evidence: CanonicalStudyProvenanceChip[];
  message: string;
};

export type CanonicalStudyFlagStatus = "fired" | "unresolved" | "unsupported";

export type CanonicalStudyFlag = {
  id: string;
  checkId: string;
  status: CanonicalStudyFlagStatus;
  question: string;
  operands: CanonicalStudyProvenanceChip[];
  message: string;
};

export type CanonicalStudyCounts = {
  entities: number;
  entityIdentityUnresolved: number;
  operativeViews: number;
  relations: number;
  unresolvedComparisons: number;
  series: number;
  requirements: number;
  flags: number;
  possiblySameLinks: number;
  unresolvedItems: number;
  rejectedFields: number;
};

export type CanonicalStudyArtifactBody = {
  schemaVersion: typeof CANONICAL_STUDY_ARTIFACT_SCHEMA_VERSION;
  packId: string;
  packVersion: string;
  packContentSha256: string;
  foundationContentSha256: string;
  studyRunId: string;
  attemptId: string;
  caseId: string;
  documents: Array<{
    sourceDocumentId: string;
    documentTypeId: string | null;
    sortRank: number;
    verifiedOrderingDate: string | null;
  }>;
  documentLineage: CanonicalStudyDocumentLineageEdge[];
  entities: CanonicalStudyEntity[];
  operativeViews: CanonicalStudyOperativeView[];
  relations: CanonicalStudyRelation[];
  unresolvedComparisons: CanonicalStudyUnresolvedComparison[];
  series: CanonicalStudySeries[];
  requirements: CanonicalStudyRequirementResult[];
  flags: CanonicalStudyFlag[];
  possiblySameLinks: CanonicalStudyPossiblySameLink[];
  unresolvedItems: CanonicalStudyFoundationUnresolvedItem[];
  rejectedFields: CanonicalStudyFoundationRejectedField[];
  counts: CanonicalStudyCounts;
};

export type CanonicalStudyArtifact = CanonicalStudyArtifactBody & {
  createdAt: string;
  contentSha256: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function parseCanonicalStudyArtifact(raw: unknown): CanonicalStudyArtifact {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("CANONICAL_STUDY_INVALID: expected object");
  }
  const record = raw as Record<string, unknown>;
  if (record.schemaVersion !== CANONICAL_STUDY_ARTIFACT_SCHEMA_VERSION) {
    throw new Error("CANONICAL_STUDY_INVALID: schemaVersion");
  }
  if (!isNonEmptyString(record.contentSha256)) {
    throw new Error("CANONICAL_STUDY_INVALID: contentSha256");
  }
  return raw as CanonicalStudyArtifact;
}
