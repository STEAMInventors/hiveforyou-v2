import {
  CLAIM_VALUE_V3_JSON_SCHEMA,
  EVIDENCE_REFERENCE_V3_JSON_SCHEMA,
  type JsonSchema,
} from "../case-intelligence/3/json-schema.js";
import {
  CANONICAL_STUDY_GRAPH_SCHEMA_VERSION,
  CANONICAL_STUDY_GRAPH_VALIDATION_SCHEMA_VERSION,
  CANONICAL_STUDY_PROJECTION_MANIFEST_SCHEMA_VERSION,
  CANONICAL_STUDY_REASONER_PROPOSAL_SCHEMA_VERSION,
  FINDING_KINDS,
  GRAPH_VALIDATION_STATUSES,
  OBSERVATION_ROLES,
  OBSERVATION_SNAPSHOT_SCHEMA_VERSION,
  OBSERVATION_VERIFICATION_STATUSES,
  OBSERVABLE_IDENTITY_STATUSES,
  RESOLUTION_VALIDATION_OUTCOMES,
} from "./types.js";

export type { JsonSchema };

const nonEmptyString: JsonSchema = { type: "string", minLength: 1 };
const sha256Hex: JsonSchema = { type: "string", minLength: 64 };

function stringLiteral(value: string): JsonSchema {
  return { type: "string", enum: [value] };
}

const packPinSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    packId: nonEmptyString,
    packVersion: nonEmptyString,
    packContentSha256: sha256Hex,
  },
  required: ["packId", "packVersion", "packContentSha256"],
};

const modelPinSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    providerId: nonEmptyString,
    modelId: nonEmptyString,
    promptId: nonEmptyString,
    promptVersion: nonEmptyString,
    promptSha256: sha256Hex,
  },
  required: ["providerId", "modelId", "promptId", "promptVersion", "promptSha256"],
};

const effectivePeriodSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    start: nonEmptyString,
    end: nonEmptyString,
    precision: { type: "string", enum: ["day", "month", "year", "unknown"] },
  },
  required: [],
};

const snapshotObservationSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: nonEmptyString,
    readerFactId: nonEmptyString,
    predicateTypeId: nonEmptyString,
    value: CLAIM_VALUE_V3_JSON_SCHEMA,
    unit: nonEmptyString,
    role: { type: "string", enum: OBSERVATION_ROLES },
    observedOn: nonEmptyString,
    effectivePeriod: effectivePeriodSchema,
    evidenceRefs: {
      type: "array",
      minItems: 1,
      items: EVIDENCE_REFERENCE_V3_JSON_SCHEMA,
    },
    verificationStatus: { type: "string", enum: OBSERVATION_VERIFICATION_STATUSES },
  },
  required: [
    "id",
    "readerFactId",
    "predicateTypeId",
    "value",
    "role",
    "evidenceRefs",
    "verificationStatus",
  ],
};

export const OBSERVATION_SNAPSHOT_JSON_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    schemaVersion: stringLiteral(OBSERVATION_SNAPSHOT_SCHEMA_VERSION),
    studyRunId: nonEmptyString,
    attemptId: nonEmptyString,
    caseId: nonEmptyString,
    domainId: nonEmptyString,
    packPin: packPinSchema,
    source: {
      type: "object",
      additionalProperties: false,
      properties: {
        schemaVersion: stringLiteral("reader-accepted-facts/1"),
        studyRunId: nonEmptyString,
        attemptId: nonEmptyString,
        promptSha256: sha256Hex,
      },
      required: ["schemaVersion", "studyRunId", "attemptId", "promptSha256"],
    },
    createdAt: nonEmptyString,
    contentDigest: sha256Hex,
    observations: { type: "array", items: snapshotObservationSchema },
  },
  required: [
    "schemaVersion",
    "studyRunId",
    "attemptId",
    "caseId",
    "domainId",
    "packPin",
    "source",
    "createdAt",
    "contentDigest",
    "observations",
  ],
};

const observableSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: nonEmptyString,
    typeId: nonEmptyString,
    label: nonEmptyString,
    aliases: { type: "array", items: nonEmptyString },
    externalIds: { type: "array", items: nonEmptyString },
    identityStatus: { type: "string", enum: OBSERVABLE_IDENTITY_STATUSES },
    observationIds: { type: "array", items: nonEmptyString },
    resolutionIds: { type: "array", items: nonEmptyString },
  },
  required: ["id", "typeId", "label", "identityStatus", "observationIds"],
};

const absenceSearchScopeSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    observableTypeIds: { type: "array", items: nonEmptyString },
    relationshipTypeIds: { type: "array", items: nonEmptyString },
    documentScopeIds: { type: "array", items: nonEmptyString },
  },
  required: ["observableTypeIds", "relationshipTypeIds", "documentScopeIds"],
};

const absenceScopeSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    documentCoverageEstablished: { type: "boolean" },
    searchScopeDeclared: { type: "boolean" },
    searchScope: absenceSearchScopeSchema,
  },
  required: ["documentCoverageEstablished", "searchScopeDeclared", "searchScope"],
};

const unresolvedGraphItemsSchema: JsonSchema = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    properties: {
      id: nonEmptyString,
      kind: nonEmptyString,
      description: nonEmptyString,
      relatedObservationIds: { type: "array", items: nonEmptyString },
      relatedObservableIds: { type: "array", items: nonEmptyString },
    },
    required: ["id", "kind", "description"],
  },
};

const findingProposalSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: nonEmptyString,
    kind: { type: "string", enum: FINDING_KINDS },
    description: nonEmptyString,
    supportingObservationIds: { type: "array", items: nonEmptyString },
    supportingResolutionIds: { type: "array", items: nonEmptyString },
    absenceScope: absenceScopeSchema,
  },
  required: ["id", "kind", "description", "supportingObservationIds"],
};

export const CANONICAL_STUDY_REASONER_PROPOSAL_JSON_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    schemaVersion: stringLiteral(CANONICAL_STUDY_REASONER_PROPOSAL_SCHEMA_VERSION),
    studyRunId: nonEmptyString,
    attemptId: nonEmptyString,
    packPin: packPinSchema,
    modelPin: modelPinSchema,
    observables: { type: "array", items: observableSchema },
    observationLinks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          observationId: nonEmptyString,
          observableId: nonEmptyString,
          confidence: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["observationId", "observableId"],
      },
    },
    relationships: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: nonEmptyString,
          relationshipTypeId: nonEmptyString,
          fromObservableId: nonEmptyString,
          toObservableId: nonEmptyString,
          supportingObservationIds: { type: "array", items: nonEmptyString },
          reasoningSummary: nonEmptyString,
        },
        required: [
          "id",
          "relationshipTypeId",
          "fromObservableId",
          "toObservableId",
          "supportingObservationIds",
        ],
      },
    },
    resolutions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: nonEmptyString,
          resolutionTypeId: nonEmptyString,
          observationIds: { type: "array", items: nonEmptyString },
          observableIds: { type: "array", items: nonEmptyString },
          decision: nonEmptyString,
          supportingObservationIds: { type: "array", items: nonEmptyString },
          reasoningSummary: nonEmptyString,
        },
        required: [
          "id",
          "resolutionTypeId",
          "observationIds",
          "observableIds",
          "decision",
          "supportingObservationIds",
        ],
      },
    },
    candidateConflicts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: nonEmptyString,
          observationIds: { type: "array", minItems: 1, items: nonEmptyString },
          subjectDescription: nonEmptyString,
          nature: nonEmptyString,
          temporalScope: effectivePeriodSchema,
          supportingObservationIds: { type: "array", items: nonEmptyString },
        },
        required: ["id", "observationIds", "nature", "supportingObservationIds"],
      },
    },
    candidateFindings: { type: "array", items: findingProposalSchema },
    unresolved: unresolvedGraphItemsSchema,
  },
  required: [
    "schemaVersion",
    "studyRunId",
    "attemptId",
    "packPin",
    "modelPin",
    "observables",
    "observationLinks",
    "relationships",
    "resolutions",
    "candidateConflicts",
    "candidateFindings",
    "unresolved",
  ],
};

const validatedOutcomeSchema: JsonSchema = {
  type: "string",
  enum: RESOLUTION_VALIDATION_OUTCOMES,
};

export const ACCEPTED_CANONICAL_STUDY_GRAPH_JSON_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    schemaVersion: stringLiteral(CANONICAL_STUDY_GRAPH_SCHEMA_VERSION),
    studyRunId: nonEmptyString,
    attemptId: nonEmptyString,
    caseId: nonEmptyString,
    domainId: nonEmptyString,
    packPin: packPinSchema,
    modelPin: modelPinSchema,
    observationSnapshotDigest: sha256Hex,
    createdAt: nonEmptyString,
    contentDigest: sha256Hex,
    observables: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: nonEmptyString,
          typeId: nonEmptyString,
          label: nonEmptyString,
          aliases: { type: "array", items: nonEmptyString },
          externalIds: { type: "array", items: nonEmptyString },
          identityStatus: { type: "string", enum: OBSERVABLE_IDENTITY_STATUSES },
          observationIds: { type: "array", items: nonEmptyString },
          resolutionIds: { type: "array", items: nonEmptyString },
          validationOutcome: validatedOutcomeSchema,
        },
        required: [
          "id",
          "typeId",
          "label",
          "identityStatus",
          "observationIds",
          "validationOutcome",
        ],
      },
    },
    observations: { type: "array", items: snapshotObservationSchema },
    relationships: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: nonEmptyString,
          relationshipTypeId: nonEmptyString,
          fromObservableId: nonEmptyString,
          toObservableId: nonEmptyString,
          supportingObservationIds: { type: "array", items: nonEmptyString },
          reasoningSummary: nonEmptyString,
          validationOutcome: validatedOutcomeSchema,
        },
        required: [
          "id",
          "relationshipTypeId",
          "fromObservableId",
          "toObservableId",
          "supportingObservationIds",
          "validationOutcome",
        ],
      },
    },
    resolutions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: nonEmptyString,
          resolutionTypeId: nonEmptyString,
          observationIds: { type: "array", items: nonEmptyString },
          observableIds: { type: "array", items: nonEmptyString },
          decision: nonEmptyString,
          supportingObservationIds: { type: "array", items: nonEmptyString },
          reasoningSummary: nonEmptyString,
          validationOutcome: validatedOutcomeSchema,
        },
        required: [
          "id",
          "resolutionTypeId",
          "observationIds",
          "observableIds",
          "decision",
          "supportingObservationIds",
          "validationOutcome",
        ],
      },
    },
    conflicts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: nonEmptyString,
          observationIds: { type: "array", minItems: 1, items: nonEmptyString },
          subjectDescription: nonEmptyString,
          nature: nonEmptyString,
          temporalScope: effectivePeriodSchema,
          supportingObservationIds: { type: "array", items: nonEmptyString },
        },
        required: ["id", "observationIds", "nature", "supportingObservationIds"],
      },
    },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: nonEmptyString,
          kind: { type: "string", enum: FINDING_KINDS },
          description: nonEmptyString,
          supportingObservationIds: { type: "array", items: nonEmptyString },
          supportingResolutionIds: { type: "array", items: nonEmptyString },
          absenceScope: absenceScopeSchema,
          validationOutcome: validatedOutcomeSchema,
        },
        required: ["id", "kind", "description", "supportingObservationIds", "validationOutcome"],
      },
    },
    unresolved: unresolvedGraphItemsSchema,
  },
  required: [
    "schemaVersion",
    "studyRunId",
    "attemptId",
    "caseId",
    "domainId",
    "packPin",
    "modelPin",
    "observationSnapshotDigest",
    "createdAt",
    "contentDigest",
    "observables",
    "observations",
    "relationships",
    "resolutions",
    "conflicts",
    "findings",
    "unresolved",
  ],
};

const validatorIssueSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    layer: { type: "string", enum: ["L1", "L2", "L3"] },
    code: nonEmptyString,
    severity: { type: "string", enum: ["fatal", "reject", "warning"] },
    message: nonEmptyString,
    path: nonEmptyString,
    relatedIds: { type: "array", items: nonEmptyString },
  },
  required: ["layer", "code", "severity", "message"],
};

export const CANONICAL_STUDY_GRAPH_VALIDATION_JSON_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    schemaVersion: stringLiteral(CANONICAL_STUDY_GRAPH_VALIDATION_SCHEMA_VERSION),
    studyRunId: nonEmptyString,
    attemptId: nonEmptyString,
    status: { type: "string", enum: GRAPH_VALIDATION_STATUSES },
    accepted: {
      type: "object",
      additionalProperties: false,
      properties: {
        observables: { type: "array", items: { type: "object" } },
        relationships: { type: "array", items: { type: "object" } },
        resolutions: { type: "array", items: { type: "object" } },
        conflicts: { type: "array", items: { type: "object" } },
        findings: { type: "array", items: { type: "object" } },
      },
      required: ["observables", "relationships", "resolutions", "conflicts", "findings"],
    },
    rejected: { type: "array", items: validatorIssueSchema },
    unresolved: { type: "array", items: validatorIssueSchema },
    acceptedGraph: ACCEPTED_CANONICAL_STUDY_GRAPH_JSON_SCHEMA,
  },
  required: ["schemaVersion", "studyRunId", "attemptId", "status", "accepted", "rejected", "unresolved"],
};

export const CANONICAL_STUDY_PROJECTION_MANIFEST_JSON_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    schemaVersion: stringLiteral(CANONICAL_STUDY_PROJECTION_MANIFEST_SCHEMA_VERSION),
    studyRunId: nonEmptyString,
    attemptId: nonEmptyString,
    sourceGraphDigest: sha256Hex,
    projectionKind: {
      type: "string",
      enum: ["case-intelligence/3", "hive.canonical-study/1", "canonical-study-report/1"],
    },
    projectionSchemaVersion: nonEmptyString,
    derivedAt: nonEmptyString,
    contentDigest: sha256Hex,
    lineage: {
      type: "object",
      additionalProperties: false,
      properties: {
        graphSchemaVersion: stringLiteral(CANONICAL_STUDY_GRAPH_SCHEMA_VERSION),
        observableIds: { type: "array", items: nonEmptyString },
        findingIds: { type: "array", items: nonEmptyString },
      },
      required: ["graphSchemaVersion", "observableIds", "findingIds"],
    },
  },
  required: [
    "schemaVersion",
    "studyRunId",
    "attemptId",
    "sourceGraphDigest",
    "projectionKind",
    "projectionSchemaVersion",
    "derivedAt",
    "contentDigest",
    "lineage",
  ],
};
